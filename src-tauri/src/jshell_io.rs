use serde::{Deserialize, Serialize};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::{
    collections::HashMap,
    fs,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicU32, Ordering},
        Arc, Mutex, TryLockError,
    },
    time::{Duration, Instant},
};
use tauri::{Emitter, State};

use crate::java_tools::{java_executable_name, resolve_resource};
use crate::BRIDGE_STDERR_BUFFER_MAX_LINES;
#[cfg(target_os = "windows")]
use crate::CREATE_NO_WINDOW;
#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::{
    CloseHandle, GetLastError, ERROR_INVALID_PARAMETER, WAIT_OBJECT_0, WAIT_TIMEOUT,
};
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::Threading::{
    OpenProcess, TerminateProcess, WaitForSingleObject, PROCESS_TERMINATE,
};

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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct JshellOutputEvent {
    stdout: String,
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
    bridge_pid: Arc<AtomicU32>,
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


fn parse_prefixed_bridge_response(
    line: &str,
    bridge_response_prefix: &str,
) -> Option<(Option<String>, serde_json::Value)> {
    for (index, _) in line.rmatch_indices(bridge_response_prefix) {
        let payload_start = index + bridge_response_prefix.len();
        let payload = &line[payload_start..];
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(payload) {
            let leading_noise = line[..index].trim();
            let noise = if leading_noise.is_empty() {
                None
            } else {
                Some(leading_noise.to_string())
            };
            return Some((noise, value));
        }
    }
    None
}

fn jshell_send_internal<T: for<'de> Deserialize<'de>>(
    session: &mut JshellSession,
    request: serde_json::Value,
    on_chunk: Option<&dyn Fn(&str)>,
) -> Result<T, String> {
    const BRIDGE_RESPONSE_SCAN_LIMIT: usize = 512;
    const BRIDGE_NOISE_ERROR_PREVIEW_LINES: usize = 200;
    const BRIDGE_RESPONSE_PREFIX: &str = "__UNIMOZER_BRIDGE__:";
    const BRIDGE_CHUNK_PREFIX: &str = "__UNIMOZER_BRIDGE_CHUNK__:";

    let stderr_snapshot = || {
        if let Ok(lines) = session.stderr.lock() {
            if lines.is_empty() {
                return String::new();
            }
            return format!("\n{}", lines.join("\n"));
        }
        String::new()
    };

    let command_name = request
        .get("cmd")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_string();

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

        if let Some((_, chunk_val)) =
            parse_prefixed_bridge_response(trimmed, BRIDGE_CHUNK_PREFIX)
        {
            if let Some(cb) = on_chunk {
                if let Some(text) = chunk_val.get("stdout").and_then(|v| v.as_str()) {
                    cb(text);
                }
            }
            continue;
        }

        if let Some((leading_noise, value)) =
            parse_prefixed_bridge_response(trimmed, BRIDGE_RESPONSE_PREFIX)
        {
            if let Some(noise) = leading_noise {
                noise_lines.push(noise);
            }
            parsed = Some(value);
            break;
        }

        if trimmed.contains(BRIDGE_RESPONSE_PREFIX) {
            noise_lines.push(trimmed.to_string());
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

fn jshell_send<T: for<'de> Deserialize<'de>>(
    session: &mut JshellSession,
    request: serde_json::Value,
) -> Result<T, String> {
    jshell_send_internal(session, request, None)
}

fn jshell_send_streaming<T: for<'de> Deserialize<'de>>(
    session: &mut JshellSession,
    request: serde_json::Value,
    on_chunk: &dyn Fn(&str),
) -> Result<T, String> {
    jshell_send_internal(session, request, Some(on_chunk))
}

fn stop_current_session(state: &JshellState) {
    state.bridge_pid.store(0, Ordering::SeqCst);
    if let Ok(mut guard) = state.current.lock() {
        if let Some(mut session) = guard.take() {
            let _ = session.child.kill();
            let _ = session.child.wait();
        }
    }
}

#[cfg(target_os = "windows")]
fn force_kill_pid(pid: u32) -> Result<(), String> {
    const WAIT_TIMEOUT_MS: u32 = 5_000;
    const SYNCHRONIZE_ACCESS: u32 = 0x0010_0000;
    unsafe {
        let handle = OpenProcess(PROCESS_TERMINATE | SYNCHRONIZE_ACCESS, 0, pid);
        if handle.is_null() {
            let error = GetLastError();
            // PID is no longer valid.
            if error == ERROR_INVALID_PARAMETER {
                return Ok(());
            }
            return Err(format!(
                "Failed to open JShell process {pid} for termination (winerr={error})"
            ));
        }

        let mut taskkill_command = Command::new("taskkill");
        taskkill_command
            .arg("/PID")
            .arg(pid.to_string())
            .arg("/T")
            .arg("/F")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(CREATE_NO_WINDOW);
        let taskkill_result = taskkill_command.output();

        let taskkill_succeeded = match &taskkill_result {
            Ok(output) => output.status.success(),
            Err(_) => false,
        };

        if !taskkill_succeeded && TerminateProcess(handle, 1) == 0 {
            let error = GetLastError();
            CloseHandle(handle);
            return Err(format!(
                "Failed to terminate JShell process {pid} (winerr={error})"
            ));
        }
        let wait_result = WaitForSingleObject(handle, WAIT_TIMEOUT_MS);
        let wait_error = GetLastError();
        CloseHandle(handle);
        if wait_result == WAIT_OBJECT_0 {
            return Ok(());
        }
        if wait_result == WAIT_TIMEOUT {
            let taskkill_details = match &taskkill_result {
                Ok(output) => format!(
                    "taskkill_exit={:?} stdout='{}' stderr='{}'",
                    output.status.code(),
                    String::from_utf8_lossy(&output.stdout).trim(),
                    String::from_utf8_lossy(&output.stderr).trim()
                ),
                Err(error) => format!("taskkill_error={error}"),
            };
            return Err(format!(
                "Timed out waiting for JShell process {pid} to terminate ({taskkill_details})"
            ));
        }
        Err(format!(
            "Failed waiting for JShell process {pid} termination (wait={wait_result}, winerr={wait_error})"
        ))
    }
}

#[cfg(not(target_os = "windows"))]
fn force_kill_pid(pid: u32) -> Result<(), String> {
    let status = unsafe { libc::kill(pid as libc::pid_t, libc::SIGKILL) };
    if status != 0 {
        let error = std::io::Error::last_os_error();
        if error.raw_os_error() == Some(libc::ESRCH) {
            // Process already gone.
            return Ok(());
        }
        return Err(format!("Failed to terminate JShell process {pid}: {error}"));
    }
    // Reap the process so it doesn't linger as a zombie. ECHILD means the
    // process is not a direct child of ours (e.g. it was a grandchild), in
    // which case its parent will reap it and there is nothing for us to do.
    let mut wstatus = 0i32;
    let waited = unsafe { libc::waitpid(pid as libc::pid_t, &mut wstatus, 0) };
    if waited < 0 {
        let error = std::io::Error::last_os_error();
        if error.raw_os_error() != Some(libc::ECHILD) {
            return Err(format!(
                "Failed to wait for JShell process {pid} after kill: {error}"
            ));
        }
    }
    Ok(())
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

fn start_jshell_session_internal(
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

    let mut guard = state
        .current
        .lock()
        .map_err(|_| "Failed to lock JShell state".to_string())?;
    let child_pid = child.id();
    *guard = Some(JshellSession {
        child,
        stdin,
        stdout: BufReader::new(stdout),
        stderr: stderr_lines,
    });
    state.bridge_pid.store(child_pid, Ordering::SeqCst);
    drop(guard);

    Ok(())
}

fn start_jshell_session(
    app: &tauri::AppHandle,
    state: &JshellState,
    root: &str,
    classpath: &str,
    options: &JshellStartOptions,
) -> Result<(), String> {
    start_jshell_session_internal(app, state, root, classpath, options)
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
pub fn jshell_stop(state: State<JshellState>) -> Result<(), String> {
    stop_current_session(state.inner());
    Ok(())
}

#[tauri::command]
pub fn jshell_force_stop(state: State<JshellState>) -> Result<bool, String> {
    let tracked_pid = state.inner().bridge_pid.load(Ordering::SeqCst);
    let mut terminated_any = false;
    let mut first_error: Option<String> = None;

    if tracked_pid != 0 {
        match force_kill_pid(tracked_pid) {
            Ok(_) => terminated_any = true,
            Err(error) => {
                if first_error.is_none() {
                    first_error = Some(error);
                }
            }
        }
    }

    const LOCK_TIMEOUT_MS: u64 = 2_000;
    let lock_deadline = Instant::now() + Duration::from_millis(LOCK_TIMEOUT_MS);
    loop {
        match state.inner().current.try_lock() {
            Ok(mut guard) => {
                if let Some(mut session) = guard.take() {
                    let session_pid = session.child.id();
                    if session_pid != 0 && session_pid != tracked_pid {
                        match force_kill_pid(session_pid) {
                            Ok(_) => terminated_any = true,
                            Err(error) => {
                                if first_error.is_none() {
                                    first_error = Some(error);
                                }
                            }
                        }
                    }
                    let _ = session.child.kill();
                    let _ = session.child.wait();
                    if session_pid != 0 {
                        terminated_any = true;
                    }
                }
                state.inner().bridge_pid.store(0, Ordering::SeqCst);
                if terminated_any {
                    return Ok(true);
                }
                if let Some(error) = first_error {
                    return Err(error);
                }
                return Ok(false);
            }
            Err(TryLockError::WouldBlock) => {
                if Instant::now() >= lock_deadline {
                    return Err(
                        "JShell process was terminated, but session cleanup timed out".to_string(),
                    );
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            Err(TryLockError::Poisoned(_)) => {
                return Err("Failed to lock JShell session state".to_string());
            }
        }
    }
}

fn jshell_eval_internal_streaming(
    state: &JshellState,
    code: &str,
    app: &tauri::AppHandle,
) -> Result<JshellEvalResponse, String> {
    // Batch chunks before emitting events so a tight infinite loop cannot
    // flood the JS event loop and prevent the Stop button from being handled.
    // No total cap here — the frontend's rolling line buffer handles size limits
    // silently, so the student always sees the most recent output without any
    // tool message injected into the program's output stream.
    const BATCH_BYTES: usize = 4 * 1024;

    let batch = std::cell::RefCell::new(String::new());

    let mut guard = state
        .current
        .lock()
        .map_err(|_| "Failed to lock JShell state".to_string())?;
    let session = guard
        .as_mut()
        .ok_or_else(|| "JShell is not running".to_string())?;

    let result: JshellEvalResponse = jshell_send_streaming(
        session,
        serde_json::json!({ "cmd": "eval", "code": code }),
        &|chunk| {
            let mut b = batch.borrow_mut();
            if !b.is_empty() {
                b.push('\n');
            }
            b.push_str(chunk);
            if b.len() >= BATCH_BYTES {
                let _ = app.emit("jshell-output", JshellOutputEvent { stdout: b.clone() });
                b.clear();
            }
        },
    )?;

    // Flush whatever didn't fill a full batch (normal method completion).
    let b = batch.borrow();
    if !b.is_empty() {
        let _ = app.emit("jshell-output", JshellOutputEvent { stdout: b.clone() });
    }

    Ok(result)
}

#[tauri::command]
pub async fn jshell_eval(
    app: tauri::AppHandle,
    state: State<'_, JshellState>,
    code: String,
) -> Result<JshellEvalResponse, String> {
    let state_owned = JshellState {
        current: state.inner().current.clone(),
        bridge_pid: state.inner().bridge_pid.clone(),
    };
    tauri::async_runtime::spawn_blocking(move || {
        jshell_eval_internal_streaming(&state_owned, &code, &app)
    })
    .await
    .map_err(|error| format!("Failed to join JShell eval task: {error}"))?
}

#[tauri::command]
pub async fn jshell_inspect(
    state: State<'_, JshellState>,
    var_name: String,
) -> Result<JshellInspectResponse, String> {
    let state_owned = JshellState {
        current: state.inner().current.clone(),
        bridge_pid: state.inner().bridge_pid.clone(),
    };
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = state_owned
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
    })
    .await
    .map_err(|error| format!("Failed to join JShell inspect task: {error}"))?
}

#[tauri::command]
pub async fn jshell_vars(state: State<'_, JshellState>) -> Result<JshellVarsResponse, String> {
    let state_owned = JshellState {
        current: state.inner().current.clone(),
        bridge_pid: state.inner().bridge_pid.clone(),
    };
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = state_owned
            .current
            .lock()
            .map_err(|_| "Failed to lock JShell state".to_string())?;
        let session = guard
            .as_mut()
            .ok_or_else(|| "JShell is not running".to_string())?;
        jshell_send(session, serde_json::json!({ "cmd": "vars" }))
    })
    .await
    .map_err(|error| format!("Failed to join JShell vars task: {error}"))?
}

pub fn shutdown_jshell(state: &JshellState) {
    state.bridge_pid.store(0, Ordering::SeqCst);
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

#[cfg(test)]
mod tests {
    use super::parse_prefixed_bridge_response;

    const PREFIX: &str = "__UNIMOZER_BRIDGE__:";

    #[test]
    fn parse_prefixed_bridge_response_accepts_prefix_at_line_start() {
        let line = r#"__UNIMOZER_BRIDGE__:{"ok":true}"#;
        let parsed = parse_prefixed_bridge_response(line, PREFIX)
            .expect("expected prefixed response")
            .1;
        assert_eq!(parsed.get("ok").and_then(|value| value.as_bool()), Some(true));
    }

    #[test]
    fn parse_prefixed_bridge_response_accepts_prefix_after_noise() {
        let line = r#"1, 2, 3__UNIMOZER_BRIDGE__:{"ok":true,"stdout":"done"}"#;
        let (noise, parsed) = parse_prefixed_bridge_response(line, PREFIX)
            .expect("expected prefixed response with noise");
        assert_eq!(noise.as_deref(), Some("1, 2, 3"));
        assert_eq!(parsed.get("ok").and_then(|value| value.as_bool()), Some(true));
    }

    #[test]
    fn parse_prefixed_bridge_response_uses_last_valid_prefix() {
        let line = r#"__UNIMOZER_BRIDGE__:garbage__UNIMOZER_BRIDGE__:{"ok":false}"#;
        let parsed = parse_prefixed_bridge_response(line, PREFIX)
            .expect("expected parser to recover from earlier invalid prefix")
            .1;
        assert_eq!(
            parsed.get("ok").and_then(|value| value.as_bool()),
            Some(false)
        );
    }
}
