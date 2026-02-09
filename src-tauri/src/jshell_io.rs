use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Command, Stdio},
    sync::{Arc, Mutex},
};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
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
    let stderr_snapshot = || {
        if let Ok(lines) = session.stderr.lock() {
            if lines.is_empty() {
                return String::new();
            }
            return format!("\n{}", lines.join("\n"));
        }
        String::new()
    };
    let payload = serde_json::to_string(&request).map_err(crate::command_error::to_command_error)?;
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

    let mut response = String::new();
    let bytes = session
        .stdout
        .read_line(&mut response)
        .map_err(|error| format!("{}{}", error, stderr_snapshot()))?;
    if bytes == 0 {
        return Err(format!(
            "JShell bridge closed unexpectedly{}",
            stderr_snapshot()
        ));
    }
    serde_json::from_str::<T>(&response).map_err(crate::command_error::to_command_error)
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

    let mut child = command.spawn().map_err(crate::command_error::to_command_error)?;
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
                if reader.read_line(&mut line).ok().filter(|n| *n > 0).is_none() {
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

