use serde::{Deserialize, Serialize};
use std::{
    io::{BufRead, BufReader, Write},
    process::{Command, Stdio},
    sync::{Arc, Mutex},
};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use tauri::State;

use crate::java_tools::{java_executable_name, resolve_resource};
use crate::shared_types::SourceOverride;
use crate::BRIDGE_STDERR_BUFFER_MAX_LINES;
#[cfg(target_os = "windows")]
use crate::CREATE_NO_WINDOW;

// Retry count for parser bridge requests when the process needs a restart.
const PARSER_SEND_MAX_ATTEMPTS: usize = 2;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UmlSourceRange {
    start_line: u32,
    start_column: u32,
    end_line: u32,
    end_column: u32,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UmlField {
    signature: String,
    #[serde(default)]
    is_static: bool,
    #[serde(default)]
    visibility: String,
    #[serde(default)]
    range: Option<UmlSourceRange>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UmlMethod {
    signature: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    return_type: String,
    #[serde(default)]
    params: Vec<UmlParam>,
    #[serde(default)]
    is_abstract: bool,
    #[serde(default)]
    is_main: bool,
    #[serde(default)]
    is_static: bool,
    #[serde(default)]
    visibility: String,
    #[serde(default)]
    range: Option<UmlSourceRange>,
    #[serde(default)]
    control_tree: Option<UmlControlTreeNode>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UmlControlTreeNode {
    kind: String,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    condition: Option<String>,
    #[serde(default)]
    loop_kind: Option<String>,
    #[serde(default)]
    range: Option<UmlSourceRange>,
    #[serde(default)]
    children: Vec<UmlControlTreeNode>,
    #[serde(default)]
    then_branch: Vec<UmlControlTreeNode>,
    #[serde(default)]
    else_branch: Vec<UmlControlTreeNode>,
    #[serde(default)]
    switch_cases: Vec<UmlSwitchCase>,
    #[serde(default)]
    catches: Vec<UmlCatchClause>,
    #[serde(default)]
    finally_branch: Vec<UmlControlTreeNode>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UmlSwitchCase {
    label: String,
    #[serde(default)]
    body: Vec<UmlControlTreeNode>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UmlCatchClause {
    exception: String,
    #[serde(default)]
    body: Vec<UmlControlTreeNode>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UmlParam {
    name: String,
    #[serde(rename = "type")]
    type_name: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UmlNode {
    id: String,
    name: String,
    kind: String,
    path: String,
    #[serde(default)]
    is_abstract: bool,
    fields: Vec<UmlField>,
    methods: Vec<UmlMethod>,
}

#[derive(Serialize, Deserialize)]
struct UmlEdge {
    id: String,
    from: String,
    to: String,
    kind: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UmlGraph {
    nodes: Vec<UmlNode>,
    edges: Vec<UmlEdge>,
    #[serde(default)]
    failed_files: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ParserRequest {
    root: String,
    src_root: String,
    overrides: Vec<SourceOverride>,
    #[serde(default)]
    include_structogram_ir: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddFieldSpec {
    name: String,
    field_type: String,
    visibility: String,
    is_static: bool,
    is_final: bool,
    #[serde(default)]
    initial_value: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddFieldRequest {
    action: String,
    path: String,
    class_id: String,
    content: String,
    field: AddFieldSpec,
    include_getter: bool,
    include_setter: bool,
    use_param_prefix: bool,
    include_javadoc: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddConstructorParam {
    name: String,
    param_type: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddConstructorRequest {
    action: String,
    path: String,
    class_id: String,
    content: String,
    params: Vec<AddConstructorParam>,
    #[serde(default)]
    include_javadoc: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddConstructorResponse {
    ok: bool,
    content: Option<String>,
    error: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddMethodSpec {
    name: String,
    return_type: String,
    visibility: String,
    is_static: bool,
    is_abstract: bool,
    include_javadoc: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddMethodParam {
    name: String,
    param_type: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddMethodRequest {
    action: String,
    path: String,
    class_id: String,
    content: String,
    method: AddMethodSpec,
    params: Vec<AddMethodParam>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddMethodResponse {
    ok: bool,
    content: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddFieldResponse {
    ok: bool,
    content: Option<String>,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseUmlGraphResponse {
    graph: UmlGraph,
    raw: String,
}

struct ParserBridgeSession {
    child: std::process::Child,
    stdin: std::process::ChildStdin,
    stdout: BufReader<std::process::ChildStdout>,
    stderr: Arc<Mutex<Vec<String>>>,
}

impl ParserBridgeSession {
    fn stderr_snapshot(&self) -> String {
        if let Ok(lines) = self.stderr.lock() {
            if lines.is_empty() {
                return String::new();
            }
            return format!("\n{}", lines.join("\n"));
        }
        String::new()
    }
}

impl Drop for ParserBridgeSession {
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
pub struct ParserBridgeState {
    current: Arc<Mutex<Option<ParserBridgeSession>>>,
}

fn spawn_parser_bridge(app: &tauri::AppHandle) -> Result<ParserBridgeSession, String> {
    let java_rel = java_executable_name();
    let java_path = resolve_resource(app, &java_rel)
        .ok_or_else(|| "Bundled Java runtime not found".to_string())?;
    let jar_path = resolve_resource(app, "java-parser/parser-bridge.jar")
        .ok_or_else(|| "Java parser bridge not found".to_string())?;

    let mut command = Command::new(java_path);
    command
        .arg("-jar")
        .arg(jar_path)
        .arg("--stdio")
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
        .ok_or_else(|| "Failed to open parser bridge stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to open parser bridge stdout".to_string())?;
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

    Ok(ParserBridgeSession {
        child,
        stdin,
        stdout: BufReader::new(stdout),
        stderr: stderr_lines,
    })
}

fn parser_send_once(session: &mut ParserBridgeSession, payload: &str) -> Result<String, String> {
    session
        .stdin
        .write_all(payload.as_bytes())
        .map_err(|error| format!("{}{}", error, session.stderr_snapshot()))?;
    session
        .stdin
        .write_all(b"\n")
        .map_err(|error| format!("{}{}", error, session.stderr_snapshot()))?;
    session
        .stdin
        .flush()
        .map_err(|error| format!("{}{}", error, session.stderr_snapshot()))?;

    let mut response = String::new();
    let bytes = session
        .stdout
        .read_line(&mut response)
        .map_err(|error| format!("{}{}", error, session.stderr_snapshot()))?;
    if bytes == 0 {
        return Err(format!(
            "Parser bridge closed unexpectedly{}",
            session.stderr_snapshot()
        ));
    }

    Ok(response)
}

fn parser_send_raw(
    app: &tauri::AppHandle,
    state: &State<ParserBridgeState>,
    request: serde_json::Value,
) -> Result<String, String> {
    let payload = serde_json::to_string(&request).map_err(crate::command_error::to_command_error)?;
    let mut last_error = String::new();

    for attempt in 0..PARSER_SEND_MAX_ATTEMPTS {
        let mut guard = state
            .current
            .lock()
            .map_err(|_| "Failed to lock parser bridge state".to_string())?;

        if guard.is_none() {
            *guard = Some(spawn_parser_bridge(app)?);
        }

        let result = {
            let session = guard
                .as_mut()
                .ok_or_else(|| "Parser bridge session unavailable".to_string())?;
            parser_send_once(session, &payload)
        };

        match result {
            Ok(raw) => {
                drop(guard);
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) {
                    if value.get("ok").and_then(|item| item.as_bool()) == Some(false) {
                        if let Some(error) = value.get("error").and_then(|item| item.as_str()) {
                            return Err(format!("Parser bridge failed: {}", error));
                        }
                    }
                }
                return Ok(raw);
            }
            Err(error) => {
                last_error = error;
                let _ = guard.take();
                drop(guard);
                if attempt == 0 {
                    continue;
                }
            }
        }
    }

    Err(last_error)
}

#[tauri::command]
pub fn parse_uml_graph(
    app: tauri::AppHandle,
    state: State<ParserBridgeState>,
    root: String,
    src_root: String,
    overrides: Vec<SourceOverride>,
    include_structogram_ir: Option<bool>,
) -> Result<ParseUmlGraphResponse, String> {
    let include_structogram_ir = include_structogram_ir.unwrap_or(false);
    let request = ParserRequest {
        root,
        src_root,
        overrides,
        include_structogram_ir,
    };
    let request_value = serde_json::to_value(&request).map_err(crate::command_error::to_command_error)?;
    let raw = parser_send_raw(&app, &state, request_value)?;
    let graph = serde_json::from_str(&raw).map_err(crate::command_error::to_command_error)?;
    Ok(ParseUmlGraphResponse { graph, raw })
}

#[tauri::command]
pub fn add_field_to_class(
    app: tauri::AppHandle,
    state: State<ParserBridgeState>,
    request: AddFieldRequest,
) -> Result<String, String> {
    let request_value = serde_json::to_value(&request).map_err(crate::command_error::to_command_error)?;
    let raw = parser_send_raw(&app, &state, request_value)?;
    let response: AddFieldResponse =
        serde_json::from_str(&raw).map_err(crate::command_error::to_command_error)?;
    if !response.ok {
        return Err(response.error.unwrap_or_else(|| "Failed to add field".to_string()));
    }
    response
        .content
        .ok_or_else(|| "Field update returned empty content".to_string())
}

#[tauri::command]
pub fn add_constructor_to_class(
    app: tauri::AppHandle,
    state: State<ParserBridgeState>,
    request: AddConstructorRequest,
) -> Result<String, String> {
    let request_value = serde_json::to_value(&request).map_err(crate::command_error::to_command_error)?;
    let raw = parser_send_raw(&app, &state, request_value)?;
    let response: AddConstructorResponse =
        serde_json::from_str(&raw).map_err(crate::command_error::to_command_error)?;
    if !response.ok {
        return Err(
            response
                .error
                .unwrap_or_else(|| "Failed to add constructor".to_string()),
        );
    }
    response
        .content
        .ok_or_else(|| "Constructor update returned empty content".to_string())
}

#[tauri::command]
pub fn add_method_to_class(
    app: tauri::AppHandle,
    state: State<ParserBridgeState>,
    request: AddMethodRequest,
) -> Result<String, String> {
    let request_value = serde_json::to_value(&request).map_err(crate::command_error::to_command_error)?;
    let raw = parser_send_raw(&app, &state, request_value)?;
    let response: AddMethodResponse =
        serde_json::from_str(&raw).map_err(crate::command_error::to_command_error)?;
    if !response.ok {
        return Err(response.error.unwrap_or_else(|| "Failed to add method".to_string()));
    }
    response
        .content
        .ok_or_else(|| "Method update returned empty content".to_string())
}

pub fn shutdown_parser_bridge(state: &ParserBridgeState) {
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

