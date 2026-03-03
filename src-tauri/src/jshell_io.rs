use serde::{Deserialize, Serialize};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::{
    collections::HashMap,
    fs,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    time::Instant,
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

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct JshellStartOptions {
    #[serde(default)]
    jvm_args: Vec<String>,
    #[serde(default)]
    remote_vm_options: Vec<String>,
    #[serde(default)]
    env_remove: Vec<String>,
    #[serde(default)]
    env_set: HashMap<String, String>,
    #[serde(default)]
    user_home: Option<String>,
    #[serde(default)]
    prefs_user_root: Option<String>,
    #[serde(default)]
    prefs_system_root: Option<String>,
    #[serde(default)]
    temp_dir: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JshellWarmupDiagnosticProfile {
    profile: String,
    description: String,
    ok: bool,
    start_ms: u64,
    warmup_ms: Option<u64>,
    details: Vec<String>,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JshellWarmupDiagnosticResult {
    diagnostic_root: String,
    steps: Vec<JshellWarmupDiagnosticProfile>,
}

struct JshellWarmupDiagnosticStep {
    profile: &'static str,
    description: &'static str,
    options: JshellStartOptions,
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

fn stop_current_session(state: &JshellState) {
    if let Ok(mut guard) = state.current.lock() {
        if let Some(mut session) = guard.take() {
            let _ = session.child.kill();
            let _ = session.child.wait();
        }
    }
}

fn non_empty_option(value: &Option<String>) -> Option<String> {
    value
        .as_ref()
        .map(|entry| entry.trim())
        .filter(|entry| !entry.is_empty())
        .map(|entry| entry.to_string())
}

fn ensure_directory(path: &str, label: &str) -> Result<String, String> {
    fs::create_dir_all(path).map_err(|error| format!("Failed to prepare {label}: {error}"))?;
    Ok(path.to_string())
}

fn start_jshell_session(
    app: &tauri::AppHandle,
    state: &JshellState,
    root: &str,
    classpath: &str,
    options: &JshellStartOptions,
) -> Result<(), String> {
    let java_rel = java_executable_name();
    let java_path = resolve_resource(app, &java_rel)
        .ok_or_else(|| "Bundled Java runtime not found".to_string())?;
    let jar_path = resolve_resource(app, "jshell-bridge/jshell-bridge.jar")
        .ok_or_else(|| "JShell bridge not found".to_string())?;

    stop_current_session(state);

    let out_dir = fs::canonicalize(classpath).unwrap_or_else(|_| PathBuf::from(classpath));
    let mut command = Command::new(java_path);
    let mut remote_vm_options: Vec<String> = Vec::new();
    command
        .arg("-Dfile.encoding=UTF-8")
        .arg("-Dstdout.encoding=UTF-8")
        .arg("-Dstderr.encoding=UTF-8")
        .arg("-Dsun.stdout.encoding=UTF-8")
        .arg("-Dsun.stderr.encoding=UTF-8");

    if let Some(user_home) = non_empty_option(&options.user_home) {
        let prepared = ensure_directory(&user_home, "JShell user.home")?;
        let property = format!("-Duser.home={prepared}");
        command.arg(&property);
        remote_vm_options.push(property);
    }
    if let Some(prefs_user_root) = non_empty_option(&options.prefs_user_root) {
        let prepared = ensure_directory(&prefs_user_root, "JShell prefs user root")?;
        let property = format!("-Djava.util.prefs.userRoot={prepared}");
        command.arg(&property);
        remote_vm_options.push(property);
    }
    if let Some(prefs_system_root) = non_empty_option(&options.prefs_system_root) {
        let prepared = ensure_directory(&prefs_system_root, "JShell prefs system root")?;
        let property = format!("-Djava.util.prefs.systemRoot={prepared}");
        command.arg(&property);
        remote_vm_options.push(property);
    }
    if let Some(temp_dir) = non_empty_option(&options.temp_dir) {
        let prepared = ensure_directory(&temp_dir, "JShell temp directory")?;
        let property = format!("-Djava.io.tmpdir={prepared}");
        command.arg(&property);
        remote_vm_options.push(property);
    }

    for argument in &options.jvm_args {
        let trimmed = argument.trim();
        if trimmed.is_empty() {
            continue;
        }
        command.arg(trimmed);
    }

    for option in &options.remote_vm_options {
        let trimmed = option.trim();
        if trimmed.is_empty() {
            continue;
        }
        remote_vm_options.push(trimmed.to_string());
    }

    command
        .arg("-jar")
        .arg(jar_path)
        .arg("--classpath")
        .arg(out_dir.to_string_lossy().to_string());

    for option in &remote_vm_options {
        command.arg("--remote-vm-option").arg(option);
    }

    command
        .current_dir(root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    for key in &options.env_remove {
        let trimmed = key.trim();
        if trimmed.is_empty() {
            continue;
        }
        command.env_remove(trimmed);
    }
    for (key, value) in &options.env_set {
        let trimmed = key.trim();
        if trimmed.is_empty() {
            continue;
        }
        command.env(trimmed, value);
    }

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

fn jshell_eval_internal(state: &JshellState, code: &str) -> Result<JshellEvalResponse, String> {
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

fn flatten_eval_success(response: JshellEvalResponse) -> Result<String, String> {
    if !response.ok {
        return Err(
            response
                .error
                .or(response.stderr)
                .unwrap_or_else(|| "JShell eval failed".to_string()),
        );
    }
    Ok(response
        .value
        .or(response.stdout)
        .unwrap_or_else(|| "<no-eval-value>".to_string()))
}

fn trim_jshell_value(value: String) -> String {
    let trimmed = value.trim().to_string();
    if trimmed.starts_with('"') && trimmed.ends_with('"') && trimmed.len() >= 2 {
        return trimmed[1..trimmed.len() - 1].to_string();
    }
    trimmed
}

fn diagnostic_steps(diagnostic_root: &PathBuf) -> Vec<JshellWarmupDiagnosticStep> {
    let env_clean = vec![
        "JAVA_TOOL_OPTIONS".to_string(),
        "JDK_JAVA_OPTIONS".to_string(),
        "_JAVA_OPTIONS".to_string(),
        "JAVA_OPTIONS".to_string(),
        "CLASSPATH".to_string(),
    ];
    let mut env_aggressive = env_clean.clone();
    env_aggressive.extend_from_slice(&[
        "JAVA_HOME".to_string(),
        "JDK_HOME".to_string(),
        "HOME".to_string(),
        "USERPROFILE".to_string(),
        "HOMEDRIVE".to_string(),
        "HOMEPATH".to_string(),
    ]);

    let local_prefs_user = diagnostic_root.join("local-prefs").join("prefs-user");
    let local_prefs_system = diagnostic_root.join("local-prefs").join("prefs-system");
    let local_home = diagnostic_root.join("local-home").join("home");
    let local_home_prefs_user = diagnostic_root.join("local-home").join("prefs-user");
    let local_home_prefs_system = diagnostic_root.join("local-home").join("prefs-system");
    let local_home_tmp = diagnostic_root.join("local-home").join("tmp");
    let aggressive_home = diagnostic_root.join("aggressive").join("home");
    let aggressive_prefs_user = diagnostic_root.join("aggressive").join("prefs-user");
    let aggressive_prefs_system = diagnostic_root.join("aggressive").join("prefs-system");
    let aggressive_tmp = diagnostic_root.join("aggressive").join("tmp");

    vec![
        JshellWarmupDiagnosticStep {
            profile: "baseline",
            description: "No overrides",
            options: JshellStartOptions::default(),
        },
        JshellWarmupDiagnosticStep {
            profile: "env-clean",
            description: "Remove Java option/env injections",
            options: JshellStartOptions {
                env_remove: env_clean.clone(),
                ..JshellStartOptions::default()
            },
        },
        JshellWarmupDiagnosticStep {
            profile: "local-prefs",
            description: "env-clean + local java.util.prefs roots",
            options: JshellStartOptions {
                env_remove: env_clean.clone(),
                prefs_user_root: Some(local_prefs_user.to_string_lossy().to_string()),
                prefs_system_root: Some(local_prefs_system.to_string_lossy().to_string()),
                ..JshellStartOptions::default()
            },
        },
        JshellWarmupDiagnosticStep {
            profile: "local-home",
            description: "local-prefs + local user.home + local java.io.tmpdir",
            options: JshellStartOptions {
                env_remove: env_clean,
                user_home: Some(local_home.to_string_lossy().to_string()),
                prefs_user_root: Some(local_home_prefs_user.to_string_lossy().to_string()),
                prefs_system_root: Some(local_home_prefs_system.to_string_lossy().to_string()),
                temp_dir: Some(local_home_tmp.to_string_lossy().to_string()),
                ..JshellStartOptions::default()
            },
        },
        JshellWarmupDiagnosticStep {
            profile: "aggressive",
            description: "Max overrides (env + local dirs + JVM property hardening)",
            options: JshellStartOptions {
                env_remove: env_aggressive,
                user_home: Some(aggressive_home.to_string_lossy().to_string()),
                prefs_user_root: Some(aggressive_prefs_user.to_string_lossy().to_string()),
                prefs_system_root: Some(aggressive_prefs_system.to_string_lossy().to_string()),
                temp_dir: Some(aggressive_tmp.to_string_lossy().to_string()),
                remote_vm_options: vec![
                    "-Djava.net.useSystemProxies=false".to_string(),
                    "-Duser.language=en".to_string(),
                    "-Duser.country=US".to_string(),
                    "-Duser.timezone=UTC".to_string(),
                    "-Djava.locale.providers=COMPAT,CLDR".to_string(),
                    "-Djdk.http.auth.tunneling.disabledSchemes=".to_string(),
                    "-Djdk.http.auth.proxying.disabledSchemes=".to_string(),
                    "-Dsun.net.client.defaultConnectTimeout=5000".to_string(),
                    "-Dsun.net.client.defaultReadTimeout=5000".to_string(),
                ],
                ..JshellStartOptions::default()
            },
        },
    ]
}

#[tauri::command]
pub fn jshell_start(
    app: tauri::AppHandle,
    state: State<JshellState>,
    root: String,
    classpath: String,
    options: Option<JshellStartOptions>,
) -> Result<(), String> {
    let resolved_options = options.unwrap_or_default();
    start_jshell_session(&app, state.inner(), &root, &classpath, &resolved_options)
}

#[tauri::command]
pub fn jshell_warmup_diagnostic(
    app: tauri::AppHandle,
    state: State<JshellState>,
    root: String,
    classpath: String,
) -> Result<JshellWarmupDiagnosticResult, String> {
    let diagnostic_root = std::env::temp_dir().join("unimozer-next-jshell-diagnostic");
    fs::create_dir_all(&diagnostic_root)
        .map_err(|error| format!("Failed to prepare diagnostic root: {error}"))?;

    let snapshot_code = r#"
"user.home=" + String.valueOf(System.getProperty("user.home")) +
" | prefs.userRoot=" + String.valueOf(System.getProperty("java.util.prefs.userRoot")) +
" | prefs.systemRoot=" + String.valueOf(System.getProperty("java.util.prefs.systemRoot")) +
" | java.io.tmpdir=" + String.valueOf(System.getProperty("java.io.tmpdir")) +
" | JAVA_TOOL_OPTIONS=" + String.valueOf(System.getenv("JAVA_TOOL_OPTIONS")) +
" | JDK_JAVA_OPTIONS=" + String.valueOf(System.getenv("JDK_JAVA_OPTIONS")) +
" | _JAVA_OPTIONS=" + String.valueOf(System.getenv("_JAVA_OPTIONS"))
"#;

    let mut results = Vec::new();
    for step in diagnostic_steps(&diagnostic_root) {
        let mut details = Vec::new();
        let start_begin = Instant::now();
        let started =
            start_jshell_session(&app, state.inner(), &root, &classpath, &step.options);
        let start_ms = start_begin.elapsed().as_millis() as u64;
        match started {
            Err(error) => {
                results.push(JshellWarmupDiagnosticProfile {
                    profile: step.profile.to_string(),
                    description: step.description.to_string(),
                    ok: false,
                    start_ms,
                    warmup_ms: None,
                    details,
                    error: Some(error),
                });
                stop_current_session(state.inner());
                continue;
            }
            Ok(()) => {
                details.push(format!("Start succeeded in {start_ms}ms"));
            }
        }

        match jshell_eval_internal(state.inner(), snapshot_code).and_then(flatten_eval_success) {
            Ok(snapshot) => {
                details.push(format!(
                    "Runtime snapshot: {}",
                    trim_jshell_value(snapshot)
                ));
            }
            Err(error) => {
                details.push(format!("Runtime snapshot failed: {error}"));
            }
        }

        let warmup_begin = Instant::now();
        let warmup_result =
            jshell_eval_internal(state.inner(), "1 + 1;").and_then(flatten_eval_success);
        let warmup_ms = warmup_begin.elapsed().as_millis() as u64;
        match warmup_result {
            Ok(value) => {
                details.push(format!(
                    "Warmup succeeded in {warmup_ms}ms (value: {})",
                    trim_jshell_value(value)
                ));
                results.push(JshellWarmupDiagnosticProfile {
                    profile: step.profile.to_string(),
                    description: step.description.to_string(),
                    ok: true,
                    start_ms,
                    warmup_ms: Some(warmup_ms),
                    details,
                    error: None,
                });
            }
            Err(error) => {
                details.push(format!("Warmup failed after {warmup_ms}ms: {error}"));
                results.push(JshellWarmupDiagnosticProfile {
                    profile: step.profile.to_string(),
                    description: step.description.to_string(),
                    ok: false,
                    start_ms,
                    warmup_ms: Some(warmup_ms),
                    details,
                    error: Some(error),
                });
            }
        }
        stop_current_session(state.inner());
    }
    stop_current_session(state.inner());

    Ok(JshellWarmupDiagnosticResult {
        diagnostic_root: diagnostic_root.to_string_lossy().to_string(),
        steps: results,
    })
}

#[tauri::command]
pub fn jshell_stop(state: State<JshellState>) -> Result<(), String> {
    stop_current_session(state.inner());
    Ok(())
}

#[tauri::command]
pub fn jshell_eval(state: State<JshellState>, code: String) -> Result<JshellEvalResponse, String> {
    jshell_eval_internal(state.inner(), &code)
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
