use serde::{Deserialize, Serialize};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::{
    fs,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Command, Stdio},
    sync::{Arc, Mutex},
};
use tauri::State;

use crate::java_tools::{java_executable_name, resolve_resource};
use crate::BRIDGE_STDERR_BUFFER_MAX_LINES;
#[cfg(target_os = "windows")]
use crate::CREATE_NO_WINDOW;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JshellField {
    name: String,
    #[serde(rename = "type")]
    #[serde(default)]
    type_name: Option<String>,
    #[serde(default)]
    value: Option<String>,
    visibility: String,
    #[serde(default)]
    is_static: bool,
    #[serde(default)]
    is_inherited: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JshellMethodInfo {
    name: String,
    #[serde(default)]
    return_type: Option<String>,
    #[serde(default)]
    param_types: Vec<String>,
    #[serde(default)]
    visibility: Option<String>,
    #[serde(default)]
    is_static: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JshellInheritedMethodGroup {
    class_name: String,
    #[serde(default)]
    methods: Vec<JshellMethodInfo>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JshellInspectResponse {
    ok: bool,
    #[serde(default)]
    type_name: Option<String>,
    #[serde(default)]
    fields: Vec<JshellField>,
    #[serde(default)]
    inherited_methods: Vec<JshellInheritedMethodGroup>,
    #[serde(default)]
    error: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JshellEvalResponse {
    ok: bool,
    #[serde(default)]
    value: Option<String>,
    #[serde(default)]
    stdout: Option<String>,
    #[serde(default)]
    stderr: Option<String>,
    #[serde(default)]
    error: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JshellVarsResponse {
    vars: Vec<JshellField>,
}

struct JshellSession {
    child: std::process::Child,
    stdin: std::process::ChildStdin,
    stdout: BufReader<std::process::ChildStdout>,
    stderr: Arc<Mutex<Vec<String>>>,
}

impl Drop for JshellSession {
    fn drop(&mut self) {
        match self.child.try_wait() {
            Ok(Some(_)) => {}
            _ => {
                let _ = self.child.kill();
                let _ = self.child.wait();
            }
        }
    }
}

#[derive(Default)]
pub struct JshellState {
    current: Arc<Mutex<Option<JshellSession>>>,
}

fn jshell_send<T: for<'de> Deserialize<'de>>(
    session: &mut JshellSession,
    request: serde_json::Value,
) -> Result<T, String> {
    const BRIDGE_RESPONSE_SCAN_LIMIT: usize = 512;
    const BRIDGE_NOISE_ERROR_PREVIEW_LINES: usize = 200;
    const BRIDGE_RESPONSE_PREFIX: &str = "__UNIMOZER_BRIDGE__:";

    let stderr_snapshot = || {
        if let Ok(lines) = session.stderr.lock() {
            if lines.is_empty() {
                return String::new();
            }
            return format!("\n{}", lines.join("\n"));
        }
        String::new()
    };
    let payload =
        serde_json::to_string(&request).map_err(crate::command_error::to_command_error)?;
    session
        .stdin
        .write_all(payload.as_bytes())
        .map_err(|error| format!("{}{}", error, stderr_snapshot()))?;
    session
        .stdin
        .write_all(b"\n")
        .map_err(|error| format!("{}{}", error, stderr_snapshot()))?;
    session
        .stdin
        .flush()
        .map_err(|error| format!("{}{}", error, stderr_snapshot()))?;

    let mut response = Vec::<u8>::new();
    let mut noise_lines: Vec<String> = Vec::new();
    let mut parsed: Option<serde_json::Value> = None;
    let mut legacy_candidate: Option<serde_json::Value> = None;
    let mut legacy_candidate_line: Option<String> = None;
    let command_name = request
        .get("cmd")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    let scan_limit = if command_name == "eval" {
        None
    } else {
        Some(BRIDGE_RESPONSE_SCAN_LIMIT)
    };
    let mut scanned_lines = 0usize;
    loop {
        if let Some(limit) = scan_limit {
            if scanned_lines >= limit {
                break;
            }
        }
        scanned_lines += 1;
        response.clear();
        let bytes = session
            .stdout
            .read_until(b'\n', &mut response)
            .map_err(|error| format!("{}{}", error, stderr_snapshot()))?;
        if bytes == 0 {
            return Err(format!(
                "JShell bridge closed unexpectedly{}",
                stderr_snapshot()
            ));
        }

        let decoded = String::from_utf8_lossy(&response);
        let trimmed = decoded.trim_end_matches(|character| character == '\r' || character == '\n');
        if trimmed.is_empty() {
            continue;
        }

        if let Some(payload) = trimmed.strip_prefix(BRIDGE_RESPONSE_PREFIX) {
            match serde_json::from_str::<serde_json::Value>(payload) {
                Ok(value) => {
                    parsed = Some(value);
                    break;
                }
                Err(_) => {
                    noise_lines.push(trimmed.to_string());
                }
            }
            continue;
        }

        match serde_json::from_str::<serde_json::Value>(trimmed) {
            Ok(value) => {
                let is_bridge_response = value
                    .as_object()
                    .and_then(|object| object.get("ok"))
                    .is_some_and(|ok| ok.is_boolean());
                if is_bridge_response {
                    if command_name == "eval" {
                        legacy_candidate_line = Some(trimmed.to_string());
                        legacy_candidate = Some(value);
                        noise_lines.push(trimmed.to_string());
                        continue;
                    }
                    parsed = Some(value);
                    break;
                }
                noise_lines.push(trimmed.to_string());
            }
            Err(_) => {
                noise_lines.push(trimmed.to_string());
            }
        }
    }

    if parsed.is_none() && command_name == "eval" {
        if let Some(candidate) = legacy_candidate.take() {
            if let Some(candidate_line) = legacy_candidate_line {
                if let Some(position) = noise_lines.iter().rposition(|line| line == &candidate_line)
                {
                    noise_lines.remove(position);
                }
            }
            parsed = Some(candidate);
        }
    }

    let mut value = parsed.ok_or_else(|| {
        let preview_lines = noise_lines
            .iter()
            .take(BRIDGE_NOISE_ERROR_PREVIEW_LINES)
            .cloned()
            .collect::<Vec<_>>();
        let omitted = noise_lines.len().saturating_sub(preview_lines.len());
        let preview_text = if preview_lines.is_empty() {
            String::new()
        } else if omitted > 0 {
            format!("{} | ... ({} more lines)", preview_lines.join(" | "), omitted)
        } else {
            preview_lines.join(" | ")
        };
        if noise_lines.is_empty() {
            format!(
                "JShell bridge did not return a JSON response{}",
                stderr_snapshot()
            )
        } else {
            format!(
                "JShell bridge returned non-JSON output: {}{}",
                preview_text,
                stderr_snapshot()
            )
        }
    })?;

    if command_name == "eval" && !noise_lines.is_empty() {
        let merged_noise = noise_lines.join("\n");
        if let Some(object) = value.as_object_mut() {
            match object.get_mut("stdout") {
                Some(existing) if existing.is_string() => {
                    if let Some(current) = existing.as_str() {
                        let combined = if current.is_empty() {
                            merged_noise
                        } else {
                            format!("{current}\n{merged_noise}")
                        };
                        *existing = serde_json::Value::String(combined);
                    }
                }
                _ => {
                    object.insert(
                        "stdout".to_string(),
                        serde_json::Value::String(merged_noise),
                    );
                }
            }
        }
    }

    serde_json::from_value::<T>(value).map_err(crate::command_error::to_command_error)
}

#[tauri::command]
pub fn jshell_start(
    app: tauri::AppHandle,
    state: State<JshellState>,
    root: String,
    classpath: String,
) -> Result<(), String> {
    let java_rel = java_executable_name();
    let java_path = resolve_resource(&app, &java_rel)
        .ok_or_else(|| "Bundled Java runtime not found".to_string())?;
    let jar_path = resolve_resource(&app, "jshell-bridge/jshell-bridge.jar")
        .ok_or_else(|| "JShell bridge not found".to_string())?;

    if let Ok(mut guard) = state.current.lock() {
        if let Some(mut session) = guard.take() {
            let _ = session.child.kill();
        }
    }

    let out_dir = fs::canonicalize(&classpath).unwrap_or_else(|_| PathBuf::from(&classpath));
    let mut command = Command::new(java_path);
    command
        .arg("-jar")
        .arg(jar_path)
        .arg("--classpath")
        .arg(out_dir.to_string_lossy().to_string())
        .current_dir(&root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command
        .spawn()
        .map_err(crate::command_error::to_command_error)?;
    let stderr_lines = Arc::new(Mutex::new(Vec::new()));
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Failed to open JShell stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to open JShell stdout".to_string())?;
    if let Some(stderr) = child.stderr.take() {
        let stderr_buffer = stderr_lines.clone();
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stderr);
            let mut line = String::new();
            loop {
                line.clear();
                if reader
                    .read_line(&mut line)
                    .ok()
                    .filter(|n| *n > 0)
                    .is_none()
                {
                    break;
                }
                let trimmed = line.trim_end().to_string();
                if let Ok(mut buffer) = stderr_buffer.lock() {
                    if buffer.len() >= BRIDGE_STDERR_BUFFER_MAX_LINES {
                        buffer.remove(0);
                    }
                    buffer.push(trimmed);
                }
            }
        });
    }

    if let Ok(mut guard) = state.current.lock() {
        *guard = Some(JshellSession {
            child,
            stdin,
            stdout: BufReader::new(stdout),
            stderr: stderr_lines,
        });
    }

    Ok(())
}

#[tauri::command]
pub fn jshell_stop(state: State<JshellState>) -> Result<(), String> {
    if let Ok(mut guard) = state.current.lock() {
        if let Some(mut session) = guard.take() {
            let _ = session.child.kill();
            let _ = session.child.wait();
        }
    }
    Ok(())
}

#[tauri::command]
pub fn jshell_eval(state: State<JshellState>, code: String) -> Result<JshellEvalResponse, String> {
    let mut guard = state
        .current
        .lock()
        .map_err(|_| "Failed to lock JShell state".to_string())?;
    let session = guard
        .as_mut()
        .ok_or_else(|| "JShell is not running".to_string())?;
    jshell_send(
        session,
        serde_json::json!({
            "cmd": "eval",
            "code": code
        }),
    )
}

#[tauri::command]
pub fn jshell_inspect(
    state: State<JshellState>,
    var_name: String,
) -> Result<JshellInspectResponse, String> {
    let mut guard = state
        .current
        .lock()
        .map_err(|_| "Failed to lock JShell state".to_string())?;
    let session = guard
        .as_mut()
        .ok_or_else(|| "JShell is not running".to_string())?;
    jshell_send(
        session,
        serde_json::json!({
            "cmd": "inspect",
            "var": var_name
        }),
    )
}

#[tauri::command]
pub fn jshell_vars(state: State<JshellState>) -> Result<JshellVarsResponse, String> {
    let mut guard = state
        .current
        .lock()
        .map_err(|_| "Failed to lock JShell state".to_string())?;
    let session = guard
        .as_mut()
        .ok_or_else(|| "JShell is not running".to_string())?;
    jshell_send(session, serde_json::json!({ "cmd": "vars" }))
}

pub fn shutdown_jshell(state: &JshellState) {
    if let Ok(mut guard) = state.current.lock() {
        if let Some(mut session) = guard.take() {
            match session.child.try_wait() {
                Ok(Some(_)) => {}
                _ => {
                    let _ = session.child.kill();
                    let _ = session.child.wait();
                }
            }
        }
    }
}
