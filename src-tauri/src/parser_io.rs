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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RenameClassBridgeRequest {
    action: String,
    path: String,
    content: String,
    old_class_name: String,
    new_class_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenameClassBridgeResponse {
    ok: bool,
    content: Option<String>,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameClassInFileResponse {
    old_path: String,
    new_path: String,
    content: String,
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

    let mut child = command
        .spawn()
        .map_err(crate::command_error::to_command_error)?;
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

    let mut response_bytes = Vec::new();
    let bytes = session
        .stdout
        .read_until(b'\n', &mut response_bytes)
        .map_err(|error| format!("{}{}", error, session.stderr_snapshot()))?;
    if bytes == 0 {
        return Err(format!(
            "Parser bridge closed unexpectedly{}",
            session.stderr_snapshot()
        ));
    }

    let response = match String::from_utf8(response_bytes) {
        Ok(value) => value,
        Err(error) => {
            // Keep parsing the JSON envelope even if bridge output encoding is wrong.
            let bytes = error.into_bytes();
            String::from_utf8_lossy(&bytes).into_owned()
        }
    };

    Ok(response)
}

fn parser_send_raw(
    app: &tauri::AppHandle,
    state: &State<ParserBridgeState>,
    request: serde_json::Value,
) -> Result<String, String> {
    let payload =
        serde_json::to_string(&request).map_err(crate::command_error::to_command_error)?;
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

fn is_valid_java_identifier(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if first == '_' || first == '$' || first.is_ascii_alphabetic() {
        // valid start
    } else {
        return false;
    }
    chars.all(|ch| ch == '_' || ch == '$' || ch.is_ascii_alphanumeric())
}

fn renamed_java_path(file_path: &str, new_class_name: &str) -> Result<PathBuf, String> {
    let source = PathBuf::from(file_path);
    let parent = source
        .parent()
        .ok_or_else(|| "Source file has no parent directory".to_string())?;
    Ok(parent.join(format!("{new_class_name}.java")))
}

#[cfg(target_os = "windows")]
fn is_case_only_rename(source_path: &std::path::Path, target_path: &std::path::Path) -> bool {
    if source_path.parent() != target_path.parent() {
        return false;
    }
    let Some(source_name) = source_path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };
    let Some(target_name) = target_path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };
    source_name != target_name && source_name.eq_ignore_ascii_case(target_name)
}

#[cfg(not(target_os = "windows"))]
fn is_case_only_rename(_source_path: &std::path::Path, _target_path: &std::path::Path) -> bool {
    false
}

fn case_rename_temp_path(source_path: &std::path::Path) -> Result<PathBuf, String> {
    let parent = source_path
        .parent()
        .ok_or_else(|| "Source file has no parent directory".to_string())?;
    let stem = source_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("class");
    for index in 0..32 {
        let candidate = parent.join(format!(".{stem}.unimozer-rename-{index}.tmp"));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("Unable to allocate temporary file for case-only rename".to_string())
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
    let request_value =
        serde_json::to_value(&request).map_err(crate::command_error::to_command_error)?;
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
    let request_value =
        serde_json::to_value(&request).map_err(crate::command_error::to_command_error)?;
    let raw = parser_send_raw(&app, &state, request_value)?;
    let response: AddFieldResponse =
        serde_json::from_str(&raw).map_err(crate::command_error::to_command_error)?;
    if !response.ok {
        return Err(response
            .error
            .unwrap_or_else(|| "Failed to add field".to_string()));
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
    let request_value =
        serde_json::to_value(&request).map_err(crate::command_error::to_command_error)?;
    let raw = parser_send_raw(&app, &state, request_value)?;
    let response: AddConstructorResponse =
        serde_json::from_str(&raw).map_err(crate::command_error::to_command_error)?;
    if !response.ok {
        return Err(response
            .error
            .unwrap_or_else(|| "Failed to add constructor".to_string()));
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
    let request_value =
        serde_json::to_value(&request).map_err(crate::command_error::to_command_error)?;
    let raw = parser_send_raw(&app, &state, request_value)?;
    let response: AddMethodResponse =
        serde_json::from_str(&raw).map_err(crate::command_error::to_command_error)?;
    if !response.ok {
        return Err(response
            .error
            .unwrap_or_else(|| "Failed to add method".to_string()));
    }
    response
        .content
        .ok_or_else(|| "Method update returned empty content".to_string())
}

#[tauri::command]
pub fn rename_class_in_file(
    app: tauri::AppHandle,
    state: State<ParserBridgeState>,
    project_root: String,
    file_path: String,
    old_class_name: String,
    new_class_name: String,
) -> Result<RenameClassInFileResponse, String> {
    let old_class_name = old_class_name.trim();
    let new_class_name = new_class_name.trim();
    if old_class_name.is_empty() {
        return Err("Current class name is required".to_string());
    }
    if new_class_name.is_empty() {
        return Err("New class name is required".to_string());
    }
    if old_class_name == new_class_name {
        return Err("New class name must be different".to_string());
    }
    if !is_valid_java_identifier(new_class_name) {
        return Err("New class name is not a valid Java identifier".to_string());
    }

    let project_root_path = PathBuf::from(project_root);
    if !project_root_path.is_dir() {
        return Err("Project root does not exist".to_string());
    }

    let source_path = PathBuf::from(&file_path);
    if !source_path.is_file() {
        return Err("Source class file does not exist".to_string());
    }

    let target_path = renamed_java_path(&file_path, new_class_name)?;
    let case_only_rename = is_case_only_rename(&source_path, &target_path);
    if target_path.exists() && !case_only_rename {
        return Err(format!("Class '{new_class_name}' already exists"));
    }

    let source_content = fs::read_to_string(&source_path).map_err(crate::command_error::to_command_error)?;
    let request = RenameClassBridgeRequest {
        action: "renameClass".to_string(),
        path: file_path.clone(),
        content: source_content,
        old_class_name: old_class_name.to_string(),
        new_class_name: new_class_name.to_string(),
    };
    let request_value =
        serde_json::to_value(&request).map_err(crate::command_error::to_command_error)?;
    let raw = parser_send_raw(&app, &state, request_value)?;
    let bridge_response: RenameClassBridgeResponse =
        serde_json::from_str(&raw).map_err(crate::command_error::to_command_error)?;
    if !bridge_response.ok {
        return Err(
            bridge_response
                .error
                .unwrap_or_else(|| "Failed to rename class".to_string()),
        );
    }
    let updated_content = bridge_response
        .content
        .ok_or_else(|| "Rename update returned empty content".to_string())?;

    if case_only_rename {
        let temp_path = case_rename_temp_path(&source_path)?;
        fs::rename(&source_path, &temp_path).map_err(crate::command_error::to_command_error)?;
        if let Err(error) = fs::write(&temp_path, &updated_content) {
            let _ = fs::rename(&temp_path, &source_path);
            return Err(crate::command_error::to_command_error(error));
        }
        if let Err(error) = fs::rename(&temp_path, &target_path) {
            let _ = fs::rename(&temp_path, &source_path);
            return Err(crate::command_error::to_command_error(error));
        }
    } else {
        fs::write(&target_path, &updated_content).map_err(crate::command_error::to_command_error)?;
        if let Err(error) = fs::remove_file(&source_path) {
            let _ = fs::remove_file(&target_path);
            return Err(crate::command_error::to_command_error(error));
        }
    }

    Ok(RenameClassInFileResponse {
        old_path: source_path.display().to_string(),
        new_path: target_path.display().to_string(),
        content: updated_content,
    })
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
