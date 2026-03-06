use serde::{Deserialize, Serialize};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::{
    collections::HashMap,
    fs,
    hash::{Hash, Hasher},
    io::{BufRead, BufReader, BufWriter, Write},
    path::PathBuf,
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, State};

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

#[derive(Serialize, Deserialize, Clone, Copy, Default)]
#[serde(rename_all = "lowercase")]
pub enum JshellWarmupDiagnosticMode {
    #[default]
    Quick,
    Full,
}

impl JshellWarmupDiagnosticMode {
    fn as_str(self) -> &'static str {
        match self {
            Self::Quick => "quick",
            Self::Full => "full",
        }
    }
}

#[derive(Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct BridgeDiagResponse {
    #[serde(default)]
    parse_ms: Option<f64>,
    #[serde(default)]
    dispatch_ms: Option<f64>,
    #[serde(default)]
    handler_ms: Option<f64>,
    #[serde(default)]
    eval_ms: Option<f64>,
    #[serde(default)]
    serialize_ms: Option<f64>,
    #[serde(default)]
    write_ms: Option<f64>,
    #[serde(default)]
    total_ms: Option<f64>,
    #[serde(default)]
    ok: Option<bool>,
    #[serde(default)]
    error: Option<String>,
}

const BRIDGE_DIAG_POST_PREFIX: &str = "__UNIMOZER_BRIDGE_DIAG__:";

#[derive(Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct BridgeDiagPost {
    #[serde(default)]
    command_id: Option<String>,
    #[serde(default)]
    write_ms: Option<f64>,
    #[serde(default)]
    total_ms: Option<f64>,
    #[serde(default)]
    ok: Option<bool>,
    #[serde(default)]
    error: Option<String>,
}

#[derive(Clone, Default)]
struct JshellSendTiming {
    command_name: String,
    serialize_ms: f64,
    write_ms: f64,
    flush_ms: f64,
    read_ms: f64,
    parse_ms: f64,
    total_ms: f64,
    bridge_diag: Option<BridgeDiagResponse>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticTraceEvent {
    ts: u128,
    run_id: String,
    mode: String,
    profile: String,
    step_index: usize,
    command_id: String,
    side: String,
    phase: String,
    duration_ms: f64,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    meta: Option<serde_json::Value>,
}

struct DiagnosticTraceWriter {
    writer: BufWriter<fs::File>,
    run_id: String,
    mode: String,
}

impl DiagnosticTraceWriter {
    fn new(
        app: &tauri::AppHandle,
        run_id: &str,
        mode: JshellWarmupDiagnosticMode,
    ) -> Result<(Self, String), String> {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(crate::command_error::to_command_error)?;
        let logs_dir = app_data_dir.join("logs");
        fs::create_dir_all(&logs_dir).map_err(crate::command_error::to_command_error)?;
        let timestamp = unix_timestamp_ms();
        let path = logs_dir.join(format!("jshell-diagnostic-{timestamp}-{run_id}.jsonl"));
        let file = fs::File::create(&path).map_err(crate::command_error::to_command_error)?;
        Ok((
            Self {
                writer: BufWriter::new(file),
                run_id: run_id.to_string(),
                mode: mode.as_str().to_string(),
            },
            path.to_string_lossy().to_string(),
        ))
    }

    fn event(
        &mut self,
        profile: &str,
        step_index: usize,
        command_id: &str,
        side: &str,
        phase: &str,
        duration_ms: f64,
        ok: bool,
        error: Option<&str>,
    ) -> Result<(), String> {
        self.event_with_meta(
            profile, step_index, command_id, side, phase, duration_ms, ok, error, None,
        )
    }

    fn event_with_meta(
        &mut self,
        profile: &str,
        step_index: usize,
        command_id: &str,
        side: &str,
        phase: &str,
        duration_ms: f64,
        ok: bool,
        error: Option<&str>,
        meta: Option<serde_json::Value>,
    ) -> Result<(), String> {
        let payload = DiagnosticTraceEvent {
            ts: unix_timestamp_ms(),
            run_id: self.run_id.clone(),
            mode: self.mode.clone(),
            profile: profile.to_string(),
            step_index,
            command_id: command_id.to_string(),
            side: side.to_string(),
            phase: phase.to_string(),
            duration_ms,
            ok,
            error: error.map(|value| value.to_string()),
            meta,
        };
        let json = serde_json::to_string(&payload).map_err(crate::command_error::to_command_error)?;
        self.writer
            .write_all(json.as_bytes())
            .map_err(crate::command_error::to_command_error)?;
        self.writer
            .write_all(b"\n")
            .map_err(crate::command_error::to_command_error)?;
        self.writer
            .flush()
            .map_err(crate::command_error::to_command_error)?;
        Ok(())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JshellWarmupDiagnosticProfile {
    profile: String,
    description: String,
    ok: bool,
    start_ms: u64,
    start_spawn_ms: Option<u64>,
    start_handshake_ms: Option<u64>,
    start_ready_ms: Option<u64>,
    snapshot_ms: Option<u64>,
    snapshot_host_read_ms: Option<u64>,
    snapshot_bridge_total_ms: Option<u64>,
    snapshot_gap_ms: Option<i64>,
    warmup_ms: Option<u64>,
    step_total_ms: u64,
    details: Vec<String>,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JshellWarmupDiagnosticResult {
    mode: String,
    total_ms: u64,
    trace_log_path: String,
    diagnostic_root: String,
    steps: Vec<JshellWarmupDiagnosticProfile>,
}

struct JshellWarmupDiagnosticStep {
    profile: &'static str,
    description: &'static str,
    options: JshellStartOptions,
}

fn unix_timestamp_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn round_ms_u64(value: f64) -> u64 {
    value.max(0.0).round() as u64
}

fn round_ms_i64(value: f64) -> i64 {
    value.round() as i64
}

fn duration_ms(instant: Instant) -> f64 {
    instant.elapsed().as_secs_f64() * 1000.0
}

fn classify_path_kind(path: &str) -> &'static str {
    #[cfg(target_os = "windows")]
    {
        let normalized = path.replace('/', "\\");
        if normalized.starts_with(r"\\?\UNC\") {
            return "extended_unc";
        }
        if normalized.starts_with(r"\\") {
            return "unc";
        }
        let bytes = normalized.as_bytes();
        if bytes.len() >= 2 && bytes[1] == b':' {
            return "drive";
        }
        if normalized.starts_with(r"\\?\") {
            return "extended_other";
        }
        return "other";
    }
    #[cfg(not(target_os = "windows"))]
    {
        if path.starts_with('/') {
            "absolute"
        } else {
            "relative"
        }
    }
}

fn hash_identifier(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    trimmed.hash(&mut hasher);
    Some(format!("{:016x}", hasher.finish()))
}

#[derive(Default)]
struct StartSessionDiagnosticTiming {
    spawn_ms: f64,
    handshake_ms: Option<f64>,
    ready_to_command_ms: Option<f64>,
    total_ms: f64,
    handshake_timing: Option<JshellSendTiming>,
}

fn trace_command_timings(
    writer: &mut DiagnosticTraceWriter,
    profile: &str,
    step_index: usize,
    command_id: &str,
    timing: &JshellSendTiming,
    ok: bool,
    error: Option<&str>,
) -> Result<(), String> {
    writer.event(
        profile,
        step_index,
        command_id,
        "rust",
        "serialize",
        timing.serialize_ms,
        ok,
        error,
    )?;
    writer.event(
        profile,
        step_index,
        command_id,
        "rust",
        "write",
        timing.write_ms,
        ok,
        error,
    )?;
    writer.event(
        profile,
        step_index,
        command_id,
        "rust",
        "flush",
        timing.flush_ms,
        ok,
        error,
    )?;
    writer.event(
        profile,
        step_index,
        command_id,
        "rust",
        "read",
        timing.read_ms,
        ok,
        error,
    )?;
    writer.event(
        profile,
        step_index,
        command_id,
        "rust",
        "parse",
        timing.parse_ms,
        ok,
        error,
    )?;
    writer.event(
        profile,
        step_index,
        command_id,
        "rust",
        "total",
        timing.total_ms,
        ok,
        error,
    )?;

    if let Some(bridge) = &timing.bridge_diag {
        if let Some(value) = bridge.parse_ms {
            writer.event(
                profile,
                step_index,
                command_id,
                "bridge",
                "parse",
                value,
                bridge.ok.unwrap_or(ok),
                bridge.error.as_deref().or(error),
            )?;
        }
        if let Some(value) = bridge.dispatch_ms {
            writer.event(
                profile,
                step_index,
                command_id,
                "bridge",
                "dispatch",
                value,
                bridge.ok.unwrap_or(ok),
                bridge.error.as_deref().or(error),
            )?;
        }
        if let Some(value) = bridge.handler_ms {
            writer.event(
                profile,
                step_index,
                command_id,
                "bridge",
                "handler",
                value,
                bridge.ok.unwrap_or(ok),
                bridge.error.as_deref().or(error),
            )?;
        }
        if let Some(value) = bridge.eval_ms {
            writer.event(
                profile,
                step_index,
                command_id,
                "bridge",
                "eval",
                value,
                bridge.ok.unwrap_or(ok),
                bridge.error.as_deref().or(error),
            )?;
        }
        if let Some(value) = bridge.serialize_ms {
            writer.event(
                profile,
                step_index,
                command_id,
                "bridge",
                "serialize",
                value,
                bridge.ok.unwrap_or(ok),
                bridge.error.as_deref().or(error),
            )?;
        }
        if let Some(value) = bridge.write_ms {
            writer.event(
                profile,
                step_index,
                command_id,
                "bridge",
                "write",
                value,
                bridge.ok.unwrap_or(ok),
                bridge.error.as_deref().or(error),
            )?;
        }
        if let Some(value) = bridge.total_ms {
            writer.event(
                profile,
                step_index,
                command_id,
                "bridge",
                "total",
                value,
                bridge.ok.unwrap_or(ok),
                bridge.error.as_deref().or(error),
            )?;
        }
    }
    Ok(())
}

fn read_bridge_diag_post(
    stderr: &Arc<Mutex<Vec<String>>>,
    command_id: &str,
) -> Option<BridgeDiagPost> {
    for _ in 0..5 {
        if let Ok(lines) = stderr.lock() {
            if let Some(found) = lines.iter().rev().find_map(|line| {
                let payload = line.strip_prefix(BRIDGE_DIAG_POST_PREFIX)?;
                let parsed = serde_json::from_str::<BridgeDiagPost>(payload).ok()?;
                if parsed.command_id.as_deref() == Some(command_id) {
                    Some(parsed)
                } else {
                    None
                }
            }) {
                return Some(found);
            }
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    None
}

fn jshell_send_internal<T: for<'de> Deserialize<'de>>(
    session: &mut JshellSession,
    mut request: serde_json::Value,
    diagnostic_command_id: Option<&str>,
) -> Result<(T, JshellSendTiming), String> {
    const BRIDGE_RESPONSE_SCAN_LIMIT: usize = 512;
    const BRIDGE_NOISE_ERROR_PREVIEW_LINES: usize = 200;
    const BRIDGE_RESPONSE_PREFIX: &str = "__UNIMOZER_BRIDGE__:";

    let total_begin = Instant::now();
    let stderr_snapshot = || {
        if let Ok(lines) = session.stderr.lock() {
            if lines.is_empty() {
                return String::new();
            }
            return format!("\n{}", lines.join("\n"));
        }
        String::new()
    };

    if let Some(command_id) = diagnostic_command_id {
        if let Some(object) = request.as_object_mut() {
            object.insert(
                "_diag".to_string(),
                serde_json::json!({
                    "commandId": command_id
                }),
            );
        }
    }

    let command_name = request
        .get("cmd")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_string();

    let serialize_begin = Instant::now();
    let payload =
        serde_json::to_string(&request).map_err(crate::command_error::to_command_error)?;
    let serialize_ms = duration_ms(serialize_begin);

    let write_begin = Instant::now();
    session
        .stdin
        .write_all(payload.as_bytes())
        .map_err(|error| format!("{}{}", error, stderr_snapshot()))?;
    session
        .stdin
        .write_all(b"\n")
        .map_err(|error| format!("{}{}", error, stderr_snapshot()))?;
    let write_ms = duration_ms(write_begin);

    let flush_begin = Instant::now();
    session
        .stdin
        .flush()
        .map_err(|error| format!("{}{}", error, stderr_snapshot()))?;
    let flush_ms = duration_ms(flush_begin);

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
    let read_begin = Instant::now();
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
    let read_ms = duration_ms(read_begin);

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

    let parse_begin = Instant::now();
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

    let mut bridge_diag = value
        .as_object()
        .and_then(|object| object.get("_diag"))
        .cloned()
        .and_then(|raw| serde_json::from_value::<BridgeDiagResponse>(raw).ok());

    if let Some(command_id) = diagnostic_command_id {
        if let Some(post) = read_bridge_diag_post(&session.stderr, command_id) {
            match bridge_diag.as_mut() {
                Some(existing) => {
                    if existing.write_ms.is_none() {
                        existing.write_ms = post.write_ms;
                    }
                    if existing.total_ms.is_none() {
                        existing.total_ms = post.total_ms;
                    }
                    if existing.ok.is_none() {
                        existing.ok = post.ok;
                    }
                    if existing.error.is_none() {
                        existing.error = post.error;
                    }
                }
                None => {
                    bridge_diag = Some(BridgeDiagResponse {
                        write_ms: post.write_ms,
                        total_ms: post.total_ms,
                        ok: post.ok,
                        error: post.error,
                        ..BridgeDiagResponse::default()
                    });
                }
            }
        }
    }
    if let Some(object) = value.as_object_mut() {
        object.remove("_diag");
    }

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

    let parsed_value =
        serde_json::from_value::<T>(value).map_err(crate::command_error::to_command_error)?;
    let parse_ms = duration_ms(parse_begin);
    let total_ms = duration_ms(total_begin);
    Ok((
        parsed_value,
        JshellSendTiming {
            command_name,
            serialize_ms,
            write_ms,
            flush_ms,
            read_ms,
            parse_ms,
            total_ms,
            bridge_diag,
        },
    ))
}

fn jshell_send<T: for<'de> Deserialize<'de>>(
    session: &mut JshellSession,
    request: serde_json::Value,
) -> Result<T, String> {
    jshell_send_internal(session, request, None).map(|(response, _)| response)
}

fn jshell_send_timed<T: for<'de> Deserialize<'de>>(
    session: &mut JshellSession,
    request: serde_json::Value,
    command_id: &str,
) -> Result<(T, JshellSendTiming), String> {
    jshell_send_internal(session, request, Some(command_id))
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

fn start_jshell_session_internal(
    app: &tauri::AppHandle,
    state: &JshellState,
    root: &str,
    classpath: &str,
    options: &JshellStartOptions,
    diagnostic_handshake_command_id: Option<&str>,
) -> Result<StartSessionDiagnosticTiming, String> {
    let start_begin = Instant::now();
    let java_rel = java_executable_name();
    let java_path = resolve_resource(app, &java_rel)
        .ok_or_else(|| "Bundled Java runtime not found".to_string())?;
    let jar_path = resolve_resource(app, "jshell-bridge/jshell-bridge.jar")
        .ok_or_else(|| "JShell bridge not found".to_string())?;

    stop_current_session(state);

    let spawn_begin = Instant::now();
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
    *guard = Some(JshellSession {
        child,
        stdin,
        stdout: BufReader::new(stdout),
        stderr: stderr_lines,
    });
    drop(guard);

    let spawn_ms = duration_ms(spawn_begin);
    let mut timing = StartSessionDiagnosticTiming {
        spawn_ms,
        ..StartSessionDiagnosticTiming::default()
    };

    if let Some(command_id) = diagnostic_handshake_command_id {
        let handshake_begin = Instant::now();
        let mut guard = state
            .current
            .lock()
            .map_err(|_| "Failed to lock JShell state".to_string())?;
        let session = guard
            .as_mut()
            .ok_or_else(|| "JShell is not running".to_string())?;
        let (_vars, handshake_timing): (JshellVarsResponse, JshellSendTiming) = jshell_send_timed(
            session,
            serde_json::json!({ "cmd": "vars" }),
            command_id,
        )?;
        drop(guard);
        timing.handshake_ms = Some(duration_ms(handshake_begin));
        timing.handshake_timing = Some(handshake_timing);

        let ready_begin = Instant::now();
        let guard = state
            .current
            .lock()
            .map_err(|_| "Failed to lock JShell state".to_string())?;
        if guard.is_none() {
            return Err("JShell session missing after startup handshake".to_string());
        }
        drop(guard);
        timing.ready_to_command_ms = Some(duration_ms(ready_begin));
    }

    timing.total_ms = duration_ms(start_begin);

    Ok(timing)
}

fn start_jshell_session(
    app: &tauri::AppHandle,
    state: &JshellState,
    root: &str,
    classpath: &str,
    options: &JshellStartOptions,
) -> Result<(), String> {
    start_jshell_session_internal(app, state, root, classpath, options, None).map(|_| ())
}

fn start_jshell_session_timed(
    app: &tauri::AppHandle,
    state: &JshellState,
    root: &str,
    classpath: &str,
    options: &JshellStartOptions,
    handshake_command_id: &str,
) -> Result<StartSessionDiagnosticTiming, String> {
    start_jshell_session_internal(
        app,
        state,
        root,
        classpath,
        options,
        Some(handshake_command_id),
    )
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

fn jshell_eval_internal_timed(
    state: &JshellState,
    code: &str,
    command_id: &str,
) -> Result<(JshellEvalResponse, JshellSendTiming), String> {
    let mut guard = state
        .current
        .lock()
        .map_err(|_| "Failed to lock JShell state".to_string())?;
    let session = guard
        .as_mut()
        .ok_or_else(|| "JShell is not running".to_string())?;
    jshell_send_timed(
        session,
        serde_json::json!({
            "cmd": "eval",
            "code": code
        }),
        command_id,
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

fn diagnostic_steps(
    diagnostic_root: &PathBuf,
    mode: JshellWarmupDiagnosticMode,
) -> Vec<JshellWarmupDiagnosticStep> {
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

    let all_steps = vec![
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
    ];

    match mode {
        JshellWarmupDiagnosticMode::Quick => all_steps
            .into_iter()
            .filter(|step| step.profile == "baseline" || step.profile == "aggressive")
            .collect(),
        JshellWarmupDiagnosticMode::Full => all_steps,
    }
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
    mode: Option<JshellWarmupDiagnosticMode>,
) -> Result<JshellWarmupDiagnosticResult, String> {
    let mode = mode.unwrap_or_default();
    let overall_begin = Instant::now();
    let diagnostic_root = std::env::temp_dir().join("unimozer-next-jshell-diagnostic");
    fs::create_dir_all(&diagnostic_root)
        .map_err(|error| format!("Failed to prepare diagnostic root: {error}"))?;
    let run_id = format!("{:x}", unix_timestamp_ms());
    let (mut trace_writer, trace_log_path) = DiagnosticTraceWriter::new(&app, &run_id, mode)?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .ok()
        .map(|path| path.to_string_lossy().to_string());
    let temp_dir = std::env::temp_dir().to_string_lossy().to_string();
    let username_hash = std::env::var("USERNAME")
        .ok()
        .or_else(|| std::env::var("USER").ok())
        .and_then(|value| hash_identifier(&value));
    let machine_hash = std::env::var("COMPUTERNAME")
        .ok()
        .or_else(|| std::env::var("HOSTNAME").ok())
        .and_then(|value| hash_identifier(&value));
    let _ = trace_writer.event_with_meta(
        "run",
        0,
        "run-context",
        "rust",
        "environment",
        0.0,
        true,
        None,
        Some(serde_json::json!({
            "projectRoot": &root,
            "projectRootKind": classify_path_kind(&root),
            "classpath": &classpath,
            "classpathKind": classify_path_kind(&classpath),
            "workspaceRoot": &root,
            "workspaceRootKind": classify_path_kind(&root),
            "appDataDir": app_data_dir,
            "tempDir": temp_dir,
            "usernameHash": username_hash,
            "machineHash": machine_hash
        })),
    );

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
    for (step_index, step) in diagnostic_steps(&diagnostic_root, mode).into_iter().enumerate() {
        let step_begin = Instant::now();
        let mut details = Vec::new();
        let start_command_id = format!("cmd-{}-start", step_index + 1);
        let handshake_command_id = format!("cmd-{}-start-handshake", step_index + 1);
        let started = start_jshell_session_timed(
            &app,
            state.inner(),
            &root,
            &classpath,
            &step.options,
            &handshake_command_id,
        );
        let start_ms = started
            .as_ref()
            .map(|timing| round_ms_u64(timing.total_ms))
            .unwrap_or_default();
        let (start_spawn_ms, start_handshake_ms, start_ready_ms) = match started {
            Err(error) => {
                let step_total_ms = step_begin.elapsed().as_millis() as u64;
                let command_id = format!("cmd-{}-start", step_index + 1);
                let _ = trace_writer.event(
                    step.profile,
                    step_index + 1,
                    &command_id,
                    "rust",
                    "start.total",
                    start_ms as f64,
                    false,
                    Some(&error),
                );
                results.push(JshellWarmupDiagnosticProfile {
                    profile: step.profile.to_string(),
                    description: step.description.to_string(),
                    ok: false,
                    start_ms,
                    start_spawn_ms: None,
                    start_handshake_ms: None,
                    start_ready_ms: None,
                    snapshot_ms: None,
                    snapshot_host_read_ms: None,
                    snapshot_bridge_total_ms: None,
                    snapshot_gap_ms: None,
                    warmup_ms: None,
                    step_total_ms,
                    details,
                    error: Some(error),
                });
                continue;
            }
            Ok(start_timing) => {
                details.push(format!("Start succeeded in {start_ms}ms"));
                let start_spawn_ms = Some(round_ms_u64(start_timing.spawn_ms));
                let start_handshake_ms = start_timing.handshake_ms.map(round_ms_u64);
                let start_ready_ms = start_timing.ready_to_command_ms.map(round_ms_u64);
                let _ = trace_writer.event(
                    step.profile,
                    step_index + 1,
                    &start_command_id,
                    "rust",
                    "start.process_spawn",
                    start_timing.spawn_ms,
                    true,
                    None,
                );
                if let Some(handshake_ms) = start_timing.handshake_ms {
                    let _ = trace_writer.event(
                        step.profile,
                        step_index + 1,
                        &start_command_id,
                        "rust",
                        "start.bridge_handshake",
                        handshake_ms,
                        true,
                        None,
                    );
                }
                if let Some(ready_ms) = start_timing.ready_to_command_ms {
                    let _ = trace_writer.event(
                        step.profile,
                        step_index + 1,
                        &start_command_id,
                        "rust",
                        "start.ready_to_command",
                        ready_ms,
                        true,
                        None,
                    );
                }
                let _ = trace_writer.event(
                    step.profile,
                    step_index + 1,
                    &start_command_id,
                    "rust",
                    "start.total",
                    start_timing.total_ms,
                    true,
                    None,
                );
                if let Some(handshake_timing) = &start_timing.handshake_timing {
                    let _ = trace_command_timings(
                        &mut trace_writer,
                        step.profile,
                        step_index + 1,
                        &handshake_command_id,
                        handshake_timing,
                        true,
                        None,
                    );
                }
                details.push(format!(
                    "Start phases: spawn={}ms, handshake={}ms, ready={}ms",
                    round_ms_u64(start_timing.spawn_ms),
                    start_timing
                        .handshake_ms
                        .map(round_ms_u64)
                        .map(|value| value.to_string())
                        .unwrap_or_else(|| "n/a".to_string()),
                    start_timing
                        .ready_to_command_ms
                        .map(round_ms_u64)
                        .map(|value| value.to_string())
                        .unwrap_or_else(|| "n/a".to_string())
                ));
                (start_spawn_ms, start_handshake_ms, start_ready_ms)
            }
        };

        let snapshot_command_id = format!("cmd-{}-snapshot", step_index + 1);
        let (snapshot_outcome, snapshot_timing) =
            match jshell_eval_internal_timed(state.inner(), snapshot_code, &snapshot_command_id) {
                Ok((response, timing)) => (flatten_eval_success(response), timing),
                Err(error) => (
                    Err(error),
                    JshellSendTiming {
                        command_name: "eval".to_string(),
                        ..JshellSendTiming::default()
                    },
                ),
            };
        let snapshot_ms = round_ms_u64(snapshot_timing.total_ms);
        let snapshot_has_timing = snapshot_timing.total_ms > 0.0;
        let snapshot_host_read_ms = snapshot_has_timing.then(|| round_ms_u64(snapshot_timing.read_ms));
        let snapshot_bridge_total_ms = snapshot_timing
            .bridge_diag
            .as_ref()
            .and_then(|diag| diag.total_ms)
            .map(round_ms_u64);
        let snapshot_gap_ms = snapshot_timing
            .bridge_diag
            .as_ref()
            .and_then(|diag| diag.total_ms)
            .map(|bridge_total| round_ms_i64(snapshot_timing.read_ms - bridge_total));
        let snapshot_trace_error = snapshot_outcome.as_ref().err().map(String::as_str);
        let _ = trace_command_timings(
            &mut trace_writer,
            step.profile,
            step_index + 1,
            &snapshot_command_id,
            &snapshot_timing,
            snapshot_outcome.is_ok(),
            snapshot_trace_error,
        );
        details.push(format!(
            "Snapshot command total {}ms (host command={})",
            snapshot_ms, snapshot_timing.command_name
        ));
        details.push(format!(
            "Snapshot bottleneck: hostRead={}ms, bridgeTotal={}ms, gap={}ms",
            snapshot_host_read_ms
                .map(|value| value.to_string())
                .unwrap_or_else(|| "n/a".to_string()),
            snapshot_bridge_total_ms
                .map(|value| value.to_string())
                .unwrap_or_else(|| "n/a".to_string()),
            snapshot_gap_ms
                .map(|value| value.to_string())
                .unwrap_or_else(|| "n/a".to_string())
        ));
        match snapshot_outcome {
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

        let warmup_command_id = format!("cmd-{}-warmup", step_index + 1);
        let (warmup_result, warmup_timing) =
            match jshell_eval_internal_timed(state.inner(), "1 + 1;", &warmup_command_id) {
                Ok((response, timing)) => (flatten_eval_success(response), timing),
                Err(error) => (
                    Err(error),
                    JshellSendTiming {
                        command_name: "eval".to_string(),
                        ..JshellSendTiming::default()
                    },
                ),
            };
        let warmup_ms = round_ms_u64(warmup_timing.total_ms);
        let warmup_trace_error = warmup_result.as_ref().err().map(String::as_str);
        let _ = trace_command_timings(
            &mut trace_writer,
            step.profile,
            step_index + 1,
            &warmup_command_id,
            &warmup_timing,
            warmup_result.is_ok(),
            warmup_trace_error,
        );
        match warmup_result {
            Ok(value) => {
                details.push(format!(
                    "Warmup command succeeded in {warmup_ms}ms (value: {})",
                    trim_jshell_value(value)
                ));
                let step_total_ms = step_begin.elapsed().as_millis() as u64;
                details.push(format!("Step completed in {step_total_ms}ms"));
                results.push(JshellWarmupDiagnosticProfile {
                    profile: step.profile.to_string(),
                    description: step.description.to_string(),
                    ok: true,
                    start_ms,
                    start_spawn_ms,
                    start_handshake_ms,
                    start_ready_ms,
                    snapshot_ms: Some(snapshot_ms),
                    snapshot_host_read_ms,
                    snapshot_bridge_total_ms,
                    snapshot_gap_ms,
                    warmup_ms: Some(warmup_ms),
                    step_total_ms,
                    details,
                    error: None,
                });
            }
            Err(error) => {
                details.push(format!("Warmup command failed after {warmup_ms}ms: {error}"));
                let step_total_ms = step_begin.elapsed().as_millis() as u64;
                details.push(format!("Step completed in {step_total_ms}ms"));
                results.push(JshellWarmupDiagnosticProfile {
                    profile: step.profile.to_string(),
                    description: step.description.to_string(),
                    ok: false,
                    start_ms,
                    start_spawn_ms,
                    start_handshake_ms,
                    start_ready_ms,
                    snapshot_ms: Some(snapshot_ms),
                    snapshot_host_read_ms,
                    snapshot_bridge_total_ms,
                    snapshot_gap_ms,
                    warmup_ms: Some(warmup_ms),
                    step_total_ms,
                    details,
                    error: Some(error),
                });
            }
        }
    }
    let stop_begin = Instant::now();
    stop_current_session(state.inner());
    let stop_ms = stop_begin.elapsed().as_millis() as u64;
    let _ = trace_writer.event(
        "final",
        results.len().saturating_add(1),
        "cmd-final-stop",
        "rust",
        "stop_current_session",
        stop_ms as f64,
        true,
        None,
    );
    if let Some(last_step) = results.last_mut() {
        last_step
            .details
            .push(format!("Final cleanup stop completed in {stop_ms}ms"));
    }

    Ok(JshellWarmupDiagnosticResult {
        mode: mode.as_str().to_string(),
        total_ms: overall_begin.elapsed().as_millis() as u64,
        trace_log_path,
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
