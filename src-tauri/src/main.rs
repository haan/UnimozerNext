#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Read, Write};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::{
    cmp::Ordering,
    collections::HashMap,
    fs, io,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};
use std::sync::{
    atomic::{AtomicU64, Ordering as AtomicOrdering},
    Arc, Mutex,
};
use std::time::Duration;
use tauri::{Emitter, Manager};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

mod ls;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// Maximum number of stderr lines we keep per long-lived Java bridge process.
const BRIDGE_STDERR_BUFFER_MAX_LINES: usize = 50;

// Retry count for parser bridge requests when the process needs a restart.
const PARSER_SEND_MAX_ATTEMPTS: usize = 2;

// Polling interval while waiting for a launched Java process to complete.
const RUN_POLL_INTERVAL_MS: u64 = 200;

// Retry count when cleaning an existing extracted project workspace.
const WORKSPACE_CLEANUP_RETRIES: usize = 6;

// Delay between workspace cleanup retries.
const WORKSPACE_CLEANUP_RETRY_DELAY_MS: u64 = 120;

// Max number of fallback workspace names we try if the primary workspace stays locked.
const WORKSPACE_FALLBACK_SUFFIX_ATTEMPTS: usize = 32;

// Name of the reusable scratch project directory.
const SCRATCH_PROJECT_DIR_NAME: &str = "UnsavedProject";

// Stream chunk size when forwarding process output lines to the frontend.
const RUN_OUTPUT_CHUNK_SIZE_BYTES: usize = 8 * 1024;

// Safety cap to avoid unbounded frontend event traffic from runaway output.
const RUN_OUTPUT_MAX_EMIT_BYTES: usize = 200 * 1024;

// Maximum recursion depth when expanding property placeholders like `${key}`.
const PROPERTY_RESOLUTION_MAX_DEPTH: usize = 8;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileNode {
    name: String,
    path: String,
    kind: String,
    children: Option<Vec<FileNode>>,
}

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

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UmlSettings {
    show_dependencies: bool,
    #[serde(default = "default_true")]
    show_packages: bool,
    #[serde(default = "default_true")]
    show_swing_attributes: bool,
    #[serde(default)]
    panel_background: Option<String>,
    #[serde(default = "default_true")]
    code_highlight: bool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GeneralSettings {
    #[serde(default = "default_font_size")]
    font_size: u32,
}

impl Default for GeneralSettings {
    fn default() -> Self {
        Self {
            font_size: default_font_size(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct EditorSettings {
    #[serde(default = "default_editor_theme")]
    theme: String,
    #[serde(default = "default_tab_size")]
    tab_size: u32,
    #[serde(default = "default_insert_spaces")]
    insert_spaces: bool,
    #[serde(default = "default_false")]
    auto_close_brackets: bool,
    #[serde(default = "default_false")]
    auto_close_quotes: bool,
    #[serde(default = "default_false")]
    auto_close_comments: bool,
    #[serde(default = "default_true")]
    word_wrap: bool,
    #[serde(default = "default_true")]
    auto_format_on_save: bool,
}

impl Default for EditorSettings {
    fn default() -> Self {
        Self {
            theme: default_editor_theme(),
            tab_size: default_tab_size(),
            insert_spaces: default_insert_spaces(),
            auto_close_brackets: default_false(),
            auto_close_quotes: default_false(),
            auto_close_comments: default_false(),
            word_wrap: default_true(),
            auto_format_on_save: default_true(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AdvancedSettings {
    #[serde(default = "default_false")]
    debug_logging: bool,
}

impl Default for AdvancedSettings {
    fn default() -> Self {
        Self {
            debug_logging: default_false(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ObjectBenchSettings {
    #[serde(default = "default_true")]
    show_private_object_fields: bool,
    #[serde(default = "default_true")]
    show_inherited_object_fields: bool,
    #[serde(default = "default_true")]
    show_static_object_fields: bool,
}

impl Default for ObjectBenchSettings {
    fn default() -> Self {
        Self {
            show_private_object_fields: default_true(),
            show_inherited_object_fields: default_true(),
            show_static_object_fields: default_true(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LayoutSettings {
    #[serde(default = "default_split_ratio")]
    uml_split_ratio: f32,
    #[serde(default = "default_console_split_ratio")]
    console_split_ratio: f32,
    #[serde(default = "default_object_bench_split_ratio")]
    object_bench_split_ratio: f32,
}

impl Default for LayoutSettings {
    fn default() -> Self {
        Self {
            uml_split_ratio: default_split_ratio(),
            console_split_ratio: default_console_split_ratio(),
            object_bench_split_ratio: default_object_bench_split_ratio(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    #[serde(default)]
    general: GeneralSettings,
    uml: UmlSettings,
    #[serde(default)]
    object_bench: ObjectBenchSettings,
    #[serde(default)]
    editor: EditorSettings,
    #[serde(default)]
    advanced: AdvancedSettings,
    #[serde(default)]
    layout: LayoutSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            general: GeneralSettings {
                font_size: default_font_size(),
            },
            uml: UmlSettings {
                show_dependencies: true,
                show_packages: default_true(),
                show_swing_attributes: default_true(),
                panel_background: None,
                code_highlight: default_true(),
            },
            object_bench: ObjectBenchSettings {
                show_private_object_fields: default_true(),
                show_inherited_object_fields: default_true(),
                show_static_object_fields: default_true(),
            },
            editor: EditorSettings {
                theme: default_editor_theme(),
                tab_size: default_tab_size(),
                insert_spaces: default_insert_spaces(),
                auto_close_brackets: default_false(),
                auto_close_quotes: default_false(),
                auto_close_comments: default_false(),
                word_wrap: default_true(),
                auto_format_on_save: default_true(),
            },
            advanced: AdvancedSettings {
                debug_logging: default_false(),
            },
            layout: LayoutSettings {
                uml_split_ratio: default_split_ratio(),
                console_split_ratio: default_console_split_ratio(),
                object_bench_split_ratio: default_object_bench_split_ratio(),
            },
        }
    }
}

fn default_font_size() -> u32 {
    14
}

fn default_editor_theme() -> String {
    "default".to_string()
}

fn default_tab_size() -> u32 {
    4
}

fn default_insert_spaces() -> bool {
    true
}

fn default_false() -> bool {
    false
}

fn default_true() -> bool {
    true
}

fn default_split_ratio() -> f32 {
    0.5
}

fn default_console_split_ratio() -> f32 {
    0.75
}

fn default_object_bench_split_ratio() -> f32 {
    0.75
}

#[derive(Serialize, Deserialize)]
struct SourceOverride {
    path: String,
    content: String,
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
struct AddFieldRequest {
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
struct AddConstructorRequest {
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
struct AddMethodRequest {
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
struct CompileResult {
    ok: bool,
    stdout: String,
    stderr: String,
    out_dir: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RunOutputEvent {
    run_id: u64,
    stream: String,
    line: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RunCompleteEvent {
    run_id: u64,
    ok: bool,
    code: Option<i32>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RunStartEvent {
    run_id: u64,
}

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
struct JshellInspectResponse {
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
struct JshellEvalResponse {
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
struct JshellVarsResponse {
    vars: Vec<JshellField>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ParseUmlGraphResponse {
    graph: UmlGraph,
    raw: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenPackedProjectResponse {
    archive_path: String,
    workspace_dir: String,
    project_root: String,
    project_name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenScratchProjectResponse {
    project_root: String,
    project_name: String,
}

struct RunHandle {
    id: u64,
    child: std::process::Child,
}

struct RunState {
    current: Arc<Mutex<Option<RunHandle>>>,
    run_id: AtomicU64,
}

impl RunState {
    fn next_id(&self) -> u64 {
        self.run_id.fetch_add(1, AtomicOrdering::SeqCst) + 1
    }
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
struct JshellState {
    current: Arc<Mutex<Option<JshellSession>>>,
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
struct ParserBridgeState {
    current: Arc<Mutex<Option<ParserBridgeSession>>>,
}

#[derive(Default)]
struct StartupLogState {
    lines: Arc<Mutex<Vec<String>>>,
}

#[derive(Default)]
struct LaunchOpenState {
    pending_paths: Arc<Mutex<Vec<String>>>,
}

const SKIP_DIRS: [&str; 8] = [
    "node_modules",
    "target",
    "dist",
    "out",
    ".git",
    ".idea",
    "bin",
    ".unimozer-next",
];

const PACKED_SKIP_DIRS: [&str; 10] = [
    "build",
    "dist",
    "target",
    "node_modules",
    ".git",
    ".idea",
    ".vscode",
    "out",
    ".DS_Store",
    "Thumbs.db",
];

#[tauri::command]
fn list_project_tree(root: String) -> Result<FileNode, String> {
    let root_path = PathBuf::from(&root);
    if !root_path.is_dir() {
        return Err("Selected path is not a directory".to_string());
    }

    build_tree(&root_path, true)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "No Java files found".to_string())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(path, contents).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_binary_file(path: String, contents_base64: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let trimmed = contents_base64.trim();
    let payload = trimmed
        .strip_prefix("data:image/png;base64,")
        .unwrap_or(trimmed);
    let bytes = general_purpose::STANDARD
        .decode(payload)
        .map_err(|error| error.to_string())?;
    fs::write(path, bytes).map_err(|error| error.to_string())
}

#[tauri::command]
fn remove_text_file(path: String) -> Result<(), String> {
    fs::remove_file(path).map_err(|error| error.to_string())
}

fn stable_hash(input: &str) -> u64 {
    const OFFSET_BASIS: u64 = 0xcbf29ce484222325;
    const PRIME: u64 = 0x00000100000001B3;
    let mut hash = OFFSET_BASIS;
    for byte in input.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(PRIME);
    }
    hash
}

fn sanitize_project_name(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = sanitized.trim_matches('_');
    if trimmed.is_empty() {
        "project".to_string()
    } else {
        trimmed.to_string()
    }
}

fn packed_workspace_dir(app: &tauri::AppHandle, archive_path: &Path) -> Result<PathBuf, String> {
    let local_data = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?;
    let workspace_root = local_data.join("packed-workspaces");
    fs::create_dir_all(&workspace_root).map_err(|error| error.to_string())?;

    let stem = archive_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("project");
    let safe_stem = sanitize_project_name(stem);
    let hash = stable_hash(&archive_path.to_string_lossy());
    Ok(workspace_root.join(format!("{}-{:016x}", safe_stem, hash)))
}

fn scratch_workspace_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let local_data = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?;
    let workspace_root = local_data.join("scratch-workspaces");
    fs::create_dir_all(&workspace_root).map_err(|error| error.to_string())?;
    Ok(workspace_root)
}

fn recreate_workspace_dir(path: &Path) -> io::Result<()> {
    if path.exists() {
        fs::remove_dir_all(path)?;
    }
    fs::create_dir_all(path)?;
    Ok(())
}

fn prepare_workspace_dir(base_workspace: &Path) -> Result<PathBuf, String> {
    let mut last_error: Option<String> = None;
    for attempt in 0..=WORKSPACE_CLEANUP_RETRIES {
        match recreate_workspace_dir(base_workspace) {
            Ok(()) => return Ok(base_workspace.to_path_buf()),
            Err(error) => {
                last_error = Some(error.to_string());
                if attempt < WORKSPACE_CLEANUP_RETRIES {
                    std::thread::sleep(Duration::from_millis(WORKSPACE_CLEANUP_RETRY_DELAY_MS));
                }
            }
        }
    }

    let parent = base_workspace
        .parent()
        .ok_or_else(|| "Workspace directory has no parent".to_string())?;
    let base_name = base_workspace
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("workspace");

    for attempt in 0..WORKSPACE_FALLBACK_SUFFIX_ATTEMPTS {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_millis();
        let candidate = parent.join(format!("{}-session-{}-{}", base_name, timestamp, attempt + 1));
        if candidate.exists() {
            continue;
        }
        match fs::create_dir_all(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) => {
                last_error = Some(error.to_string());
            }
        }
    }

    Err(format!(
        "Failed to prepare workspace directory: {}",
        last_error.unwrap_or_else(|| "unknown error".to_string())
    ))
}

fn prepare_fixed_workspace_dir(path: &Path) -> Result<(), String> {
    let mut last_error: Option<String> = None;
    for attempt in 0..=WORKSPACE_CLEANUP_RETRIES {
        match recreate_workspace_dir(path) {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = Some(error.to_string());
                if attempt < WORKSPACE_CLEANUP_RETRIES {
                    std::thread::sleep(Duration::from_millis(WORKSPACE_CLEANUP_RETRY_DELAY_MS));
                }
            }
        }
    }
    Err(format!(
        "Failed to prepare scratch workspace directory: {}",
        last_error.unwrap_or_else(|| "unknown error".to_string())
    ))
}

fn should_skip_packed_component(component: &str) -> bool {
    PACKED_SKIP_DIRS
        .iter()
        .any(|item| item.eq_ignore_ascii_case(component))
}

fn should_skip_packed_relative(relative: &Path) -> bool {
    for (index, component) in relative.components().enumerate() {
        if index == 0 {
            continue;
        }
        if let std::path::Component::Normal(value) = component {
            if should_skip_packed_component(&value.to_string_lossy()) {
                return true;
            }
        }
    }
    false
}

fn collect_pack_paths(base_parent: &Path, current: &Path, out: &mut Vec<PathBuf>) -> io::Result<()> {
    let relative = current.strip_prefix(base_parent).unwrap_or(current);
    if should_skip_packed_relative(relative) {
        return Ok(());
    }

    out.push(current.to_path_buf());
    if current.is_dir() {
        let mut children = Vec::new();
        for entry in fs::read_dir(current)? {
            children.push(entry?.path());
        }
        children.sort_by(|left, right| {
            normalize_for_compare(left.clone()).cmp(&normalize_for_compare(right.clone()))
        });
        for child in children {
            collect_pack_paths(base_parent, &child, out)?;
        }
    }
    Ok(())
}

fn build_archive_temp_path(archive_path: &Path) -> PathBuf {
    PathBuf::from(format!("{}.tmp", archive_path.to_string_lossy()))
}

fn build_archive_backup_path(archive_path: &Path) -> PathBuf {
    PathBuf::from(format!("{}.bak", archive_path.to_string_lossy()))
}

fn archive_root_name_from_path(archive_path: &Path) -> String {
    let stem = archive_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("project");
    sanitize_project_name(stem)
}

fn remap_archive_entry_name(relative: &Path, root_name: &str) -> String {
    let entry = relative.to_string_lossy().replace('\\', "/");
    match entry.split_once('/') {
        Some((_, tail)) if !tail.is_empty() => format!("{}/{}", root_name, tail),
        _ => root_name.to_string(),
    }
}

fn write_packed_archive(project_root: &Path, archive_path: &Path) -> Result<(), String> {
    if !project_root.is_dir() {
        return Err("Project root directory not found".to_string());
    }
    let base_parent = project_root
        .parent()
        .ok_or_else(|| "Project root has no parent directory".to_string())?;
    let archive_root_name = archive_root_name_from_path(archive_path);

    let mut paths = Vec::new();
    collect_pack_paths(base_parent, project_root, &mut paths).map_err(|error| error.to_string())?;
    if paths.is_empty() {
        return Err("Project root is empty".to_string());
    }

    if let Some(parent) = archive_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let temp_path = build_archive_temp_path(archive_path);
    if temp_path.exists() {
        let _ = fs::remove_file(&temp_path);
    }

    let result = (|| -> Result<(), String> {
        let temp_file = fs::File::create(&temp_path).map_err(|error| error.to_string())?;
        let mut zip = ZipWriter::new(temp_file);
        let file_options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Deflated)
            .unix_permissions(0o644);
        let dir_options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Stored)
            .unix_permissions(0o755);

        for path in paths {
            let relative = path.strip_prefix(base_parent).unwrap_or(&path);
            let mut entry_name = remap_archive_entry_name(relative, &archive_root_name);
            if path.is_dir() {
                if !entry_name.ends_with('/') {
                    entry_name.push('/');
                }
                zip.add_directory(entry_name, dir_options)
                    .map_err(|error| error.to_string())?;
            } else {
                zip.start_file(entry_name, file_options)
                    .map_err(|error| error.to_string())?;
                let mut source = fs::File::open(&path).map_err(|error| error.to_string())?;
                io::copy(&mut source, &mut zip).map_err(|error| error.to_string())?;
            }
        }

        zip.finish().map_err(|error| error.to_string())?;
        Ok(())
    })();

    if let Err(error) = result {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }

    let backup_path = build_archive_backup_path(archive_path);
    let had_existing_archive = archive_path.exists();
    if had_existing_archive {
        if backup_path.exists() {
            fs::remove_file(&backup_path).map_err(|error| error.to_string())?;
        }
        if let Err(error) = fs::rename(archive_path, &backup_path) {
            let _ = fs::remove_file(&temp_path);
            return Err(error.to_string());
        }
    }

    match fs::rename(&temp_path, archive_path) {
        Ok(()) => {
            if had_existing_archive && backup_path.exists() {
                let _ = fs::remove_file(&backup_path);
            }
            Ok(())
        }
        Err(error) => {
            let _ = fs::remove_file(&temp_path);
            if had_existing_archive && backup_path.exists() {
                let _ = fs::rename(&backup_path, archive_path);
            }
            Err(error.to_string())
        }
    }
}

#[tauri::command]
fn open_packed_project(
    app: tauri::AppHandle,
    archive_path: String,
) -> Result<OpenPackedProjectResponse, String> {
    let archive_input = PathBuf::from(&archive_path);
    if !archive_input.exists() {
        return Err("Project file not found".to_string());
    }
    if !archive_input.is_file() {
        return Err("Project file path is not a file".to_string());
    }

    let canonical_archive = fs::canonicalize(&archive_input).unwrap_or(archive_input);
    let archive_file = fs::File::open(&canonical_archive).map_err(|error| error.to_string())?;
    let mut archive = ZipArchive::new(archive_file).map_err(|error| error.to_string())?;
    if archive.len() == 0 {
        return Err("Project archive is empty".to_string());
    }

    let mut top_level: Option<String> = None;
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let Some(enclosed) = entry.enclosed_name() else {
            return Err("Archive contains unsafe path entries".to_string());
        };
        let mut components = enclosed.components();
        let Some(std::path::Component::Normal(first)) = components.next() else {
            continue;
        };
        let first_name = first.to_string_lossy().to_string();
        if let Some(existing) = &top_level {
            if existing != &first_name {
                return Err("Packed project must contain exactly one top-level folder".to_string());
            }
        } else {
            top_level = Some(first_name);
        }
    }

    let project_name = top_level.ok_or_else(|| "Archive has no project folder".to_string())?;
    let workspace_base = packed_workspace_dir(&app, &canonical_archive)?;
    let workspace_dir = prepare_workspace_dir(&workspace_base)?;

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let Some(enclosed) = entry.enclosed_name() else {
            return Err("Archive contains unsafe path entries".to_string());
        };
        let output_path = workspace_dir.join(enclosed);
        if entry.is_dir() || entry.name().ends_with('/') {
            fs::create_dir_all(&output_path).map_err(|error| error.to_string())?;
            continue;
        }
        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let mut output_file = fs::File::create(&output_path).map_err(|error| error.to_string())?;
        io::copy(&mut entry, &mut output_file).map_err(|error| error.to_string())?;
    }

    let project_root = workspace_dir.join(&project_name);
    if !project_root.is_dir() {
        return Err("Archive top-level project folder could not be extracted".to_string());
    }

    Ok(OpenPackedProjectResponse {
        archive_path: canonical_archive.to_string_lossy().to_string(),
        workspace_dir: workspace_dir.to_string_lossy().to_string(),
        project_root: project_root.to_string_lossy().to_string(),
        project_name,
    })
}

#[tauri::command]
fn create_packed_project(
    app: tauri::AppHandle,
    archive_path: String,
) -> Result<OpenPackedProjectResponse, String> {
    let mut archive_target = PathBuf::from(&archive_path);
    if !archive_target.is_absolute() {
        let cwd = std::env::current_dir().map_err(|error| error.to_string())?;
        archive_target = cwd.join(archive_target);
    }
    if archive_target
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("umz"))
        != Some(true)
    {
        archive_target.set_extension("umz");
    }
    if archive_target.exists() && archive_target.is_dir() {
        return Err("Project file path points to a directory".to_string());
    }
    if let Some(parent) = archive_target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let archive_identity = fs::canonicalize(&archive_target).unwrap_or(archive_target.clone());
    let workspace_base = packed_workspace_dir(&app, &archive_identity)?;
    let workspace_dir = prepare_workspace_dir(&workspace_base)?;

    let stem = archive_target
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("project");
    let project_name = sanitize_project_name(stem);
    let project_root = workspace_dir.join(&project_name);
    create_netbeans_project(project_root.to_string_lossy().to_string())?;
    write_packed_archive(&project_root, &archive_target)?;

    let archive_output = fs::canonicalize(&archive_target).unwrap_or(archive_target);
    Ok(OpenPackedProjectResponse {
        archive_path: archive_output.to_string_lossy().to_string(),
        workspace_dir: workspace_dir.to_string_lossy().to_string(),
        project_root: project_root.to_string_lossy().to_string(),
        project_name,
    })
}

#[tauri::command]
fn create_scratch_project(app: tauri::AppHandle) -> Result<OpenScratchProjectResponse, String> {
    let workspace_root = scratch_workspace_root(&app)?;
    let project_name = SCRATCH_PROJECT_DIR_NAME.to_string();
    let project_root = workspace_root.join(&project_name);
    prepare_fixed_workspace_dir(&project_root)?;
    create_netbeans_project(project_root.to_string_lossy().to_string())?;
    Ok(OpenScratchProjectResponse {
        project_root: project_root.to_string_lossy().to_string(),
        project_name,
    })
}

#[tauri::command]
fn save_packed_project(project_root: String, archive_path: String) -> Result<(), String> {
    let root_path = PathBuf::from(project_root);
    let archive_path = PathBuf::from(archive_path);
    write_packed_archive(&root_path, &archive_path)
}

#[tauri::command]
fn read_settings(app: tauri::AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let contents = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let parsed = serde_json::from_str::<AppSettings>(&contents).unwrap_or_default();
    Ok(parsed)
}

#[tauri::command]
fn write_settings(app: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    let path = settings_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let payload =
        serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?;
    fs::write(path, payload).map_err(|error| error.to_string())
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

    let mut child = command.spawn().map_err(|error| error.to_string())?;
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
    state: &tauri::State<ParserBridgeState>,
    request: serde_json::Value,
) -> Result<String, String> {
    let payload = serde_json::to_string(&request).map_err(|error| error.to_string())?;
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
fn parse_uml_graph(
    app: tauri::AppHandle,
    state: tauri::State<ParserBridgeState>,
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
    let request_value = serde_json::to_value(&request).map_err(|error| error.to_string())?;
    let raw = parser_send_raw(&app, &state, request_value)?;
    let graph = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    Ok(ParseUmlGraphResponse { graph, raw })
}

#[tauri::command]
fn add_field_to_class(
    app: tauri::AppHandle,
    state: tauri::State<ParserBridgeState>,
    request: AddFieldRequest,
) -> Result<String, String> {
    let request_value = serde_json::to_value(&request).map_err(|error| error.to_string())?;
    let raw = parser_send_raw(&app, &state, request_value)?;
    let response: AddFieldResponse =
        serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    if !response.ok {
        return Err(response.error.unwrap_or_else(|| "Failed to add field".to_string()));
    }
    response
        .content
        .ok_or_else(|| "Field update returned empty content".to_string())
}

#[tauri::command]
fn add_constructor_to_class(
    app: tauri::AppHandle,
    state: tauri::State<ParserBridgeState>,
    request: AddConstructorRequest,
) -> Result<String, String> {
    let request_value = serde_json::to_value(&request).map_err(|error| error.to_string())?;
    let raw = parser_send_raw(&app, &state, request_value)?;
    let response: AddConstructorResponse =
        serde_json::from_str(&raw).map_err(|error| error.to_string())?;
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
fn add_method_to_class(
    app: tauri::AppHandle,
    state: tauri::State<ParserBridgeState>,
    request: AddMethodRequest,
) -> Result<String, String> {
    let request_value = serde_json::to_value(&request).map_err(|error| error.to_string())?;
    let raw = parser_send_raw(&app, &state, request_value)?;
    let response: AddMethodResponse =
        serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    if !response.ok {
        return Err(response.error.unwrap_or_else(|| "Failed to add method".to_string()));
    }
    response
        .content
        .ok_or_else(|| "Method update returned empty content".to_string())
}

#[tauri::command]
fn compile_project(
    app: tauri::AppHandle,
    root: String,
    src_root: String,
    overrides: Vec<SourceOverride>,
) -> Result<CompileResult, String> {
    let _ = overrides;
    let javac_rel = javac_executable_name();
    let javac_path = resolve_resource(&app, &javac_rel)
        .ok_or_else(|| "Bundled Java compiler not found".to_string())?;

    let root_path = PathBuf::from(&root);
    let src_root_path = resolve_project_src_root(&root_path, &src_root);
    if !src_root_path.is_dir() {
        return Err("Source directory not found".to_string());
    }

    let build_dir = root_path.join("build");
    let out_dir = build_dir.join("classes");
    if out_dir.exists() {
        fs::remove_dir_all(&out_dir).map_err(|error| error.to_string())?;
    }
    fs::create_dir_all(&out_dir).map_err(|error| error.to_string())?;

    let mut java_files = Vec::new();
    collect_java_files(&src_root_path, &mut java_files).map_err(|error| error.to_string())?;

    let mut sources_list = String::new();
    for file in java_files {
        let mut path = file.to_string_lossy().replace('\\', "/");
        if path.contains(' ') || path.contains('\t') {
            path = format!("\"{}\"", path.replace('"', "\\\""));
        }
        sources_list.push_str(&path);
        sources_list.push('\n');
    }

    let sources_file = build_dir.join("sources.txt");
    fs::write(&sources_file, sources_list).map_err(|error| error.to_string())?;

    let classpath_entries = resolve_project_classpath(&root_path, "javac.classpath");
    let classpath = join_classpath(&classpath_entries);

    let mut command = Command::new(javac_path);
    command
        .arg("-encoding")
        .arg("UTF-8")
        .arg("-d")
        .arg(&out_dir)
        .args(if classpath.is_empty() {
            Vec::<String>::new()
        } else {
            vec!["-cp".to_string(), classpath.clone()]
        })
        .arg(format!("@{}", sources_file.display()))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command.spawn().map_err(|error| error.to_string())?;
    let stdout_pipe = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture javac stdout".to_string())?;
    let stderr_pipe = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture javac stderr".to_string())?;

    let stdout_reader = std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout_pipe);
        let mut buffer = String::new();
        let _ = reader.read_to_string(&mut buffer);
        buffer
    });
    let stderr_reader = std::thread::spawn(move || {
        let mut reader = BufReader::new(stderr_pipe);
        let mut buffer = String::new();
        let _ = reader.read_to_string(&mut buffer);
        buffer
    });

    let status = child.wait().map_err(|error| error.to_string())?;
    let stdout = stdout_reader.join().unwrap_or_default();
    let stderr = stderr_reader.join().unwrap_or_default();

    Ok(CompileResult {
        ok: status.success(),
        stdout,
        stderr,
        out_dir: out_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn run_main(
    app: tauri::AppHandle,
    state: tauri::State<RunState>,
    root: String,
    main_class: String,
) -> Result<u64, String> {
    let java_rel = java_executable_name();
    let java_path = resolve_resource(&app, &java_rel)
        .ok_or_else(|| "Bundled Java runtime not found".to_string())?;

    let root_path = PathBuf::from(&root);
    let class_dir = root_path.join("build").join("classes");
    if !class_dir.is_dir() {
        return Err("Compiled classes not found (build/classes missing)".to_string());
    }

    let mut classpath_entries = resolve_project_classpath(&root_path, "run.classpath");
    if classpath_entries.is_empty() {
        classpath_entries = resolve_project_classpath(&root_path, "javac.classpath");
        classpath_entries.push(class_dir.clone());
    }
    let classpath = if classpath_entries.is_empty() {
        class_dir.to_string_lossy().to_string()
    } else {
        join_classpath(&classpath_entries)
    };

    let run_id = state.next_id();
    if let Ok(mut guard) = state.current.lock() {
        if let Some(handle) = guard.as_mut() {
            let _ = handle.child.kill();
        }
    }

    let mut command = Command::new(java_path);
    command
        .arg("-cp")
        .arg(&classpath)
        .arg(&main_class)
        .current_dir(&root_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command.spawn().map_err(|error| error.to_string())?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    if let Ok(mut guard) = state.current.lock() {
        *guard = Some(RunHandle { id: run_id, child });
    }

    let _ = app.emit("run-start", RunStartEvent { run_id });

    if let Some(stdout) = stdout {
        spawn_output_reader(app.clone(), stdout, run_id, "stdout");
    }
    if let Some(stderr) = stderr {
        spawn_output_reader(app.clone(), stderr, run_id, "stderr");
    }

    let current_slot = state.current.clone();
    let app_handle = app.clone();
    std::thread::spawn(move || loop {
        let status = {
            let mut guard = match current_slot.lock() {
                Ok(guard) => guard,
                Err(_) => return,
            };
            let Some(handle) = guard.as_mut() else {
                return;
            };
            if handle.id != run_id {
                return;
            }
            match handle.child.try_wait() {
                Ok(status) => status,
                Err(_) => None,
            }
        };

        if let Some(status) = status {
            if let Ok(mut guard) = current_slot.lock() {
                if guard.as_ref().map(|handle| handle.id == run_id).unwrap_or(false) {
                    *guard = None;
                }
            }
            let payload = RunCompleteEvent {
                run_id,
                ok: status.success(),
                code: status.code(),
            };
            let _ = app_handle.emit("run-complete", payload);
            return;
        }

        std::thread::sleep(Duration::from_millis(RUN_POLL_INTERVAL_MS));
    });

    Ok(run_id)
}

#[tauri::command]
fn cancel_run(state: tauri::State<RunState>) -> Result<(), String> {
    let mut guard = state
        .current
        .lock()
        .map_err(|_| "Failed to lock run state".to_string())?;
    if let Some(handle) = guard.as_mut() {
        handle.child.kill().map_err(|error| error.to_string())?;
        let _ = handle.child.wait();
    }
    Ok(())
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
    let payload = serde_json::to_string(&request).map_err(|error| error.to_string())?;
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
    serde_json::from_str::<T>(&response).map_err(|error| error.to_string())
}

#[tauri::command]
fn jshell_start(
    app: tauri::AppHandle,
    state: tauri::State<JshellState>,
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

    let mut child = command.spawn().map_err(|error| error.to_string())?;
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
fn jshell_stop(state: tauri::State<JshellState>) -> Result<(), String> {
    if let Ok(mut guard) = state.current.lock() {
        if let Some(mut session) = guard.take() {
            let _ = session.child.kill();
            let _ = session.child.wait();
        }
    }
    Ok(())
}

#[tauri::command]
fn jshell_eval(state: tauri::State<JshellState>, code: String) -> Result<JshellEvalResponse, String> {
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
fn jshell_inspect(
    state: tauri::State<JshellState>,
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
fn jshell_vars(state: tauri::State<JshellState>) -> Result<JshellVarsResponse, String> {
    let mut guard = state
        .current
        .lock()
        .map_err(|_| "Failed to lock JShell state".to_string())?;
    let session = guard
        .as_mut()
        .ok_or_else(|| "JShell is not running".to_string())?;
    jshell_send(session, serde_json::json!({ "cmd": "vars" }))
}

fn spawn_output_reader<R: std::io::Read + Send + 'static>(
    app: tauri::AppHandle,
    reader: R,
    run_id: u64,
    stream: &str,
) {
    let stream_name = stream.to_string();
    std::thread::spawn(move || {
        let mut buf = BufReader::new(reader);
        let mut line = String::new();
        let mut buffer = String::new();
        let mut emitted_bytes: usize = 0;
        let mut truncated = false;
        loop {
            line.clear();
            match buf.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => {
                    if emitted_bytes >= RUN_OUTPUT_MAX_EMIT_BYTES {
                        if !truncated {
                            let payload = RunOutputEvent {
                                run_id,
                                stream: stream_name.clone(),
                                line: "... output truncated ...".to_string(),
                            };
                            let _ = app.emit("run-output", payload);
                            truncated = true;
                        }
                        continue;
                    }

                    let trimmed = line.trim_end_matches(&['\r', '\n'][..]);
                    if !buffer.is_empty() {
                        buffer.push('\n');
                    }
                    buffer.push_str(trimmed);
                    if buffer.len() >= RUN_OUTPUT_CHUNK_SIZE_BYTES {
                        emitted_bytes += buffer.len();
                        let payload = RunOutputEvent {
                            run_id,
                            stream: stream_name.clone(),
                            line: buffer.clone(),
                        };
                        let _ = app.emit("run-output", payload);
                        buffer.clear();
                    }
                }
                Err(_) => break,
            }
        }
        if !buffer.is_empty() && emitted_bytes < RUN_OUTPUT_MAX_EMIT_BYTES {
            let payload = RunOutputEvent {
                run_id,
                stream: stream_name,
                line: buffer,
            };
            let _ = app.emit("run-output", payload);
        }
    });
}

#[tauri::command]
fn export_netbeans_project(
    root: String,
    src_root: String,
    target: String,
    overrides: Vec<SourceOverride>,
) -> Result<(), String> {
    let root_path = PathBuf::from(&root);
    let src_root_path = resolve_src_root(&root_path, &src_root);
    if !src_root_path.is_dir() {
        return Err("Source directory not found".to_string());
    }

    let target_path = PathBuf::from(&target);
    if target_path.exists() {
        if !target_path.is_dir() {
            return Err("Target path is not a directory".to_string());
        }
        if target_path.read_dir().map_err(|error| error.to_string())?.next().is_some() {
            return Err("Target folder is not empty".to_string());
        }
    } else {
        fs::create_dir_all(&target_path).map_err(|error| error.to_string())?;
    }

    let project_name = target_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("NetBeansProject");

    let nbproject_dir = target_path.join("nbproject");
    let src_dir = target_path.join("src");
    fs::create_dir_all(&nbproject_dir).map_err(|error| error.to_string())?;
    fs::create_dir_all(&src_dir).map_err(|error| error.to_string())?;

    let mut override_map = std::collections::HashMap::new();
    for item in overrides {
        let key = normalize_for_compare(PathBuf::from(item.path));
        override_map.insert(key, item.content);
    }

    let mut java_files = Vec::new();
    collect_java_files(&src_root_path, &mut java_files).map_err(|error| error.to_string())?;

    for file in java_files {
        let relative = file.strip_prefix(&src_root_path).unwrap_or(&file);
        let target_file = src_dir.join(relative);
        if let Some(parent) = target_file.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let key = normalize_for_compare(file.clone());
        let contents = if let Some(override_content) = override_map.get(&key) {
            override_content.clone()
        } else {
            fs::read_to_string(&file).map_err(|error| error.to_string())?
        };
        fs::write(target_file, contents).map_err(|error| error.to_string())?;
    }

    let build_xml = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<project name=\"{}\" default=\"default\" basedir=\".\">\n  <description>Generated by Unimozer Next.</description>\n  <import file=\"nbproject/build-impl.xml\"/>\n</project>\n",
        project_name
    );
    fs::write(target_path.join("build.xml"), build_xml).map_err(|error| error.to_string())?;

    let project_xml = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<project xmlns=\"http://www.netbeans.org/ns/project/1\">\n  <type>org.netbeans.modules.java.j2seproject</type>\n  <configuration>\n    <data xmlns=\"http://www.netbeans.org/ns/j2se-project/3\">\n      <name>{}</name>\n      <minimum-ant-version>1.10.0</minimum-ant-version>\n      <source-roots>\n        <root id=\"src.dir\"/>\n      </source-roots>\n      <test-roots>\n        <root id=\"test.src.dir\"/>\n      </test-roots>\n    </data>\n  </configuration>\n</project>\n",
        project_name
    );
    fs::write(nbproject_dir.join("project.xml"), project_xml)
        .map_err(|error| error.to_string())?;

    let project_properties = format!(
        "application.title={}\napplication.vendor=Unimozer\nbuild.dir=build\ndist.dir=dist\ndist.jar=${{dist.dir}}/${{application.title}}.jar\njavac.source=17\njavac.target=17\nmain.class=\nplatform.active=default_platform\nsrc.dir=src\ntest.src.dir=test\nmanifest.file=manifest.mf\n",
        project_name
    );
    fs::write(nbproject_dir.join("project.properties"), project_properties)
        .map_err(|error| error.to_string())?;

    let manifest = "Manifest-Version: 1.0\n";
    fs::write(target_path.join("manifest.mf"), manifest).map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn create_netbeans_project(target: String) -> Result<(), String> {
    let target_path = PathBuf::from(&target);
    if target_path.exists() {
        if !target_path.is_dir() {
            return Err("Target path is not a directory".to_string());
        }
        if target_path.read_dir().map_err(|error| error.to_string())?.next().is_some() {
            return Err("Target folder is not empty".to_string());
        }
    } else {
        fs::create_dir_all(&target_path).map_err(|error| error.to_string())?;
    }

    let project_name = target_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("NetBeansProject");

    let nbproject_dir = target_path.join("nbproject");
    let src_dir = target_path.join("src");
    fs::create_dir_all(&nbproject_dir).map_err(|error| error.to_string())?;
    fs::create_dir_all(&src_dir).map_err(|error| error.to_string())?;

    let build_xml = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<project name=\"{}\" default=\"default\" basedir=\".\">\n  <description>Generated by Unimozer Next.</description>\n  <import file=\"nbproject/build-impl.xml\"/>\n</project>\n",
        project_name
    );
    fs::write(target_path.join("build.xml"), build_xml).map_err(|error| error.to_string())?;

    let project_xml = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<project xmlns=\"http://www.netbeans.org/ns/project/1\">\n  <type>org.netbeans.modules.java.j2seproject</type>\n  <configuration>\n    <data xmlns=\"http://www.netbeans.org/ns/j2se-project/3\">\n      <name>{}</name>\n      <minimum-ant-version>1.10.0</minimum-ant-version>\n      <source-roots>\n        <root id=\"src.dir\"/>\n      </source-roots>\n      <test-roots>\n        <root id=\"test.src.dir\"/>\n      </test-roots>\n    </data>\n  </configuration>\n</project>\n",
        project_name
    );
    fs::write(nbproject_dir.join("project.xml"), project_xml)
        .map_err(|error| error.to_string())?;

    let project_properties = format!(
        "application.title={}\napplication.vendor=Unimozer\nbuild.dir=build\ndist.dir=dist\ndist.jar=${{dist.dir}}/${{application.title}}.jar\njavac.source=17\njavac.target=17\nmain.class=\nplatform.active=default_platform\nsrc.dir=src\ntest.src.dir=test\nmanifest.file=manifest.mf\n",
        project_name
    );
    fs::write(nbproject_dir.join("project.properties"), project_properties)
        .map_err(|error| error.to_string())?;

    let manifest = "Manifest-Version: 1.0\n";
    fs::write(target_path.join("manifest.mf"), manifest).map_err(|error| error.to_string())?;

    Ok(())
}

fn build_tree(path: &Path, is_root: bool) -> io::Result<Option<FileNode>> {
    let metadata = fs::metadata(path)?;
    if metadata.is_dir() {
        if !is_root && should_skip_dir(path) {
            return Ok(None);
        }

        let mut children = Vec::new();
        for entry in fs::read_dir(path)? {
            let entry = entry?;
            let child_path = entry.path();
            if let Some(child) = build_tree(&child_path, false)? {
                children.push(child);
            }
        }

        children.sort_by(|a, b| match (a.kind.as_str(), b.kind.as_str()) {
            ("dir", "file") => Ordering::Less,
            ("file", "dir") => Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        });

        if !is_root && children.is_empty() {
            return Ok(None);
        }

        let name = path
            .file_name()
            .map(|segment| segment.to_string_lossy().to_string())
            .unwrap_or_else(|| path.display().to_string());

        Ok(Some(FileNode {
            name,
            path: path.display().to_string(),
            kind: "dir".to_string(),
            children: Some(children),
        }))
    } else if metadata.is_file() {
        if path.extension().and_then(|ext| ext.to_str()) != Some("java") {
            return Ok(None);
        }

        let name = path
            .file_name()
            .map(|segment| segment.to_string_lossy().to_string())
            .unwrap_or_else(|| path.display().to_string());

        Ok(Some(FileNode {
            name,
            path: path.display().to_string(),
            kind: "file".to_string(),
            children: None,
        }))
    } else {
        Ok(None)
    }
}

fn should_skip_dir(path: &Path) -> bool {
    match path.file_name().and_then(|segment| segment.to_str()) {
        Some(name) => SKIP_DIRS.iter().any(|skip| skip.eq_ignore_ascii_case(name)),
        None => false,
    }
}

fn jdk_relative_dir() -> &'static str {
    if cfg!(target_os = "windows") {
        if cfg!(target_arch = "aarch64") {
            "jdk/win-arm64"
        } else {
            "jdk/win-x64"
        }
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "jdk/mac-arm64"
        } else {
            "jdk/mac-x64"
        }
    } else {
        if cfg!(target_arch = "aarch64") {
            "jdk/linux-arm64"
        } else {
            "jdk/linux-x64"
        }
    }
}

fn jdtls_config_relative_dir() -> &'static str {
    if cfg!(target_os = "windows") {
        "jdtls/config_win"
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "jdtls/config_mac_arm"
        } else {
            "jdtls/config_mac"
        }
    } else {
        if cfg!(target_arch = "aarch64") {
            "jdtls/config_linux_arm"
        } else {
            "jdtls/config_linux"
        }
    }
}

pub fn java_executable_name() -> String {
    if cfg!(target_os = "windows") {
        format!("{}/bin/java.exe", jdk_relative_dir())
    } else {
        format!("{}/bin/java", jdk_relative_dir())
    }
}

fn javac_executable_name() -> String {
    if cfg!(target_os = "windows") {
        format!("{}/bin/javac.exe", jdk_relative_dir())
    } else {
        format!("{}/bin/javac", jdk_relative_dir())
    }
}

fn parse_properties_with_continuations(path: &Path) -> HashMap<String, String> {
    let mut values = HashMap::new();
    let Ok(contents) = fs::read_to_string(path) else {
        return values;
    };
    let mut buffer = String::new();
    for raw_line in contents.lines() {
        let trimmed_end = raw_line.trim_end();
        if buffer.is_empty() {
            let trimmed_start = trimmed_end.trim_start();
            if trimmed_start.is_empty()
                || trimmed_start.starts_with('#')
                || trimmed_start.starts_with('!')
            {
                continue;
            }
        }
        let continues = trimmed_end.ends_with('\\');
        let segment = if continues {
            trimmed_end.trim_end_matches('\\')
        } else {
            trimmed_end
        };
        if buffer.is_empty() {
            buffer.push_str(segment.trim_start());
        } else {
            buffer.push_str(segment.trim_start());
        }
        if continues {
            continue;
        }
        let logical = buffer.trim().to_string();
        buffer.clear();
        let separator = logical
            .find('=')
            .or_else(|| logical.find(':'))
            .unwrap_or(logical.len());
        if separator == 0 || separator >= logical.len() {
            continue;
        }
        let key = logical[..separator].trim();
        let mut value = logical[separator + 1..].trim().to_string();
        if value.contains("\\\\") {
            value = value.replace("\\\\", "\\");
        }
        if !key.is_empty() {
            values.insert(key.to_string(), value);
        }
    }
    if !buffer.is_empty() {
        let logical = buffer.trim();
        let separator = logical
            .find('=')
            .or_else(|| logical.find(':'))
            .unwrap_or(logical.len());
        if separator > 0 && separator < logical.len() {
            let key = logical[..separator].trim();
            let mut value = logical[separator + 1..].trim().to_string();
            if value.contains("\\\\") {
                value = value.replace("\\\\", "\\");
            }
            if !key.is_empty() {
                values.insert(key.to_string(), value);
            }
        }
    }
    values
}

fn resolve_property_value(key: &str, props: &HashMap<String, String>, depth: usize) -> String {
    if depth > PROPERTY_RESOLUTION_MAX_DEPTH {
        return props.get(key).cloned().unwrap_or_default();
    }
    let Some(value) = props.get(key) else {
        return String::new();
    };
    resolve_value(value, props, depth + 1)
}

fn resolve_value(value: &str, props: &HashMap<String, String>, depth: usize) -> String {
    let mut output = String::new();
    let mut rest = value;
    while let Some(start) = rest.find("${") {
        let (before, after_start) = rest.split_at(start);
        output.push_str(before);
        let Some(end) = after_start.find('}') else {
            output.push_str(after_start);
            return output;
        };
        let key = &after_start[2..end];
        let resolved = resolve_property_value(key, props, depth + 1);
        output.push_str(&resolved);
        rest = &after_start[end + 1..];
    }
    output.push_str(rest);
    output
}

fn split_classpath(value: &str) -> Vec<String> {
    let mut entries = Vec::new();
    let mut current = String::new();
    let chars: Vec<char> = value.chars().collect();
    let mut index = 0;
    while index < chars.len() {
        let ch = chars[index];
        if ch == ';' {
            let trimmed = current.trim();
            if !trimmed.is_empty() {
                entries.push(trimmed.to_string());
            }
            current.clear();
            index += 1;
            continue;
        }
        if ch == ':' {
            let is_drive = index == 1
                && chars[0].is_ascii_alphabetic()
                && index + 1 < chars.len()
                && (chars[index + 1] == '\\' || chars[index + 1] == '/');
            if !is_drive {
                let trimmed = current.trim();
                if !trimmed.is_empty() {
                    entries.push(trimmed.to_string());
                }
                current.clear();
                index += 1;
                continue;
            }
        }
        current.push(ch);
        index += 1;
    }
    let trimmed = current.trim();
    if !trimmed.is_empty() {
        entries.push(trimmed.to_string());
    }
    entries
}

fn resolve_project_classpath(root: &Path, key: &str) -> Vec<PathBuf> {
    let props_path = root.join("nbproject").join("project.properties");
    let props = parse_properties_with_continuations(&props_path);
    let raw_value = props.get(key).cloned().unwrap_or_default();
    if raw_value.trim().is_empty() {
        return Vec::new();
    }
    let resolved = resolve_value(&raw_value, &props, 0);
    split_classpath(&resolved)
        .into_iter()
        .filter_map(|entry| {
            let trimmed = entry.trim();
            if trimmed.is_empty() {
                return None;
            }
            let path = PathBuf::from(trimmed);
            if path.is_absolute() {
                Some(path)
            } else {
                Some(root.join(path))
            }
        })
        .collect()
}

fn join_classpath(entries: &[PathBuf]) -> String {
    let separator = if cfg!(target_os = "windows") { ";" } else { ":" };
    entries
        .iter()
        .map(|entry| entry.to_string_lossy().to_string())
        .collect::<Vec<String>>()
        .join(separator)
}

fn resolve_resource(app: &tauri::AppHandle, relative: &str) -> Option<PathBuf> {
    if let Ok(dir) = app.path().resource_dir() {
        let candidate: PathBuf = dir.join(relative);
        if candidate.exists() {
            return Some(fs::canonicalize(&candidate).unwrap_or(candidate));
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let candidate = exe_dir.join("_up_").join("resources").join(relative);
            if candidate.exists() {
                return Some(fs::canonicalize(&candidate).unwrap_or(candidate));
            }
        }
    }

    let fallback = PathBuf::from("resources").join(relative);
    if fallback.exists() {
        return Some(fs::canonicalize(&fallback).unwrap_or(fallback));
    }

    let dev_fallback = PathBuf::from("..").join("resources").join(relative);
    if dev_fallback.exists() {
        return Some(fs::canonicalize(&dev_fallback).unwrap_or(dev_fallback));
    }

    None
}

fn resolve_src_root(root: &Path, src_root: &str) -> PathBuf {
    if src_root.trim().is_empty() {
        return root.join("src");
    }
    let candidate = PathBuf::from(src_root);
    if candidate.is_absolute() {
        return candidate;
    }
    root.join(candidate)
}

fn resolve_project_src_root(root: &Path, src_root: &str) -> PathBuf {
    let nbproject = root.join("nbproject").join("project.properties");
    if nbproject.exists() {
        if let Ok(contents) = fs::read_to_string(&nbproject) {
            for line in contents.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with('#') || !trimmed.contains('=') {
                    continue;
                }
                let mut parts = trimmed.splitn(2, '=');
                let key = parts.next().unwrap_or("").trim();
                let value = parts.next().unwrap_or("").trim();
                if key == "src.dir" && !value.is_empty() {
                    let candidate = PathBuf::from(value);
                    return if candidate.is_absolute() {
                        candidate
                    } else {
                        root.join(candidate)
                    };
                }
            }
        }
    }
    resolve_src_root(root, src_root)
}

fn normalize_for_compare(path: PathBuf) -> String {
    let text = path.to_string_lossy().to_string();
    if cfg!(target_os = "windows") {
        text.to_lowercase()
    } else {
        text
    }
}

fn collect_java_files(path: &Path, acc: &mut Vec<PathBuf>) -> io::Result<()> {
    if !path.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let child = entry.path();
        if child.is_dir() {
            collect_java_files(&child, acc)?;
        } else if child.extension().and_then(|ext| ext.to_str()) == Some("java") {
            acc.push(child);
        }
    }
    Ok(())
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    Ok(config_dir.join("settings.json"))
}

fn load_startup_settings(app: &tauri::AppHandle) -> AppSettings {
    let Ok(path) = settings_path(app) else {
        return AppSettings::default();
    };
    if !path.exists() {
        return AppSettings::default();
    }
    let Ok(contents) = fs::read_to_string(&path) else {
        return AppSettings::default();
    };
    serde_json::from_str::<AppSettings>(&contents).unwrap_or_default()
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index = 0usize;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hi = bytes[index + 1];
            let lo = bytes[index + 2];
            let hi_val = (hi as char).to_digit(16);
            let lo_val = (lo as char).to_digit(16);
            if let (Some(hi_val), Some(lo_val)) = (hi_val, lo_val) {
                out.push(((hi_val << 4) as u8) | (lo_val as u8));
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn parse_file_uri_path(raw: &str) -> Option<PathBuf> {
    let prefix = "file://";
    if !raw
        .get(..prefix.len())
        .map(|value| value.eq_ignore_ascii_case(prefix))
        .unwrap_or(false)
    {
        return None;
    }

    let mut body = &raw[prefix.len()..];
    if body
        .get(..10)
        .map(|value| value.eq_ignore_ascii_case("localhost/"))
        .unwrap_or(false)
    {
        body = &body[10..];
    }
    if body.is_empty() {
        return None;
    }

    let decoded = percent_decode(body);
    #[cfg(target_os = "windows")]
    {
        let mut normalized = decoded;
        if normalized.starts_with('/') && normalized.chars().nth(2) == Some(':') {
            normalized = normalized[1..].to_string();
        } else if !normalized.starts_with('/') && !normalized.contains(':') {
            normalized = format!(r"\\{}", normalized);
        }
        return Some(PathBuf::from(normalized.replace('/', "\\")));
    }
    #[cfg(not(target_os = "windows"))]
    {
        Some(PathBuf::from(decoded))
    }
}

fn parse_launch_umz_arg(raw: &str) -> Option<String> {
    let trimmed = raw.trim().trim_matches('"');
    if trimmed.is_empty() || trimmed.starts_with('-') {
        return None;
    }
    let path = parse_file_uri_path(trimmed).unwrap_or_else(|| PathBuf::from(trimmed));
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    if extension.as_deref() != Some("umz") {
        return None;
    }
    Some(path.to_string_lossy().to_string())
}

fn collect_startup_umz_paths() -> Vec<String> {
    std::env::args_os()
        .skip(1)
        .filter_map(|item| {
            let text = item.to_string_lossy();
            parse_launch_umz_arg(text.as_ref())
        })
        .collect()
}

fn queue_launch_open_paths(app: &tauri::AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    if let Some(state) = app.try_state::<LaunchOpenState>() {
        if let Ok(mut guard) = state.pending_paths.lock() {
            guard.extend(paths);
        }
    }
    let _ = app.emit("launch-open-paths-available", ());
}

fn resource_candidates(app: &tauri::AppHandle, relative: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(dir) = app.path().resource_dir() {
        candidates.push(dir.join(relative));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            candidates.push(exe_dir.join("_up_").join("resources").join(relative));
        }
    }
    candidates.push(PathBuf::from("resources").join(relative));
    candidates.push(PathBuf::from("..").join("resources").join(relative));
    candidates
}

fn log_startup_diagnostics(app: &tauri::AppHandle) {
    let mut lines: Vec<String> = Vec::new();
    let mut push = |text: String| {
        lines.push(text);
    };

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    push(format!("[startup] Unimozer Next diagnostics (debug logging enabled)"));
    push(format!("[startup] timestamp_unix: {}", now));
    push(format!(
        "[startup] version: {}",
        app.package_info().version.to_string()
    ));
    push(format!(
        "[startup] os: {} / arch: {}",
        std::env::consts::OS,
        std::env::consts::ARCH
    ));
    if let Ok(exe) = std::env::current_exe() {
        push(format!("[startup] exe: {}", exe.display()));
    }
    if let Ok(dir) = app.path().resource_dir() {
        push(format!("[startup] resource_dir: {}", dir.display()));
    }
    if let Ok(dir) = app.path().app_data_dir() {
        push(format!("[startup] app_data_dir: {}", dir.display()));
    }
    if let Ok(dir) = app.path().app_config_dir() {
        push(format!("[startup] app_config_dir: {}", dir.display()));
    }
    if let Ok(path) = settings_path(app) {
        push(format!("[startup] settings_path: {}", path.display()));
    }

    let raw_args = std::env::args_os()
        .skip(1)
        .map(|arg| arg.to_string_lossy().to_string())
        .collect::<Vec<String>>();
    push(format!("[startup] launch_args: {:?}", raw_args));
    let parsed_launch_paths = collect_startup_umz_paths();
    push(format!(
        "[startup] parsed_launch_umz_paths: {:?}",
        parsed_launch_paths
    ));

    let jdk_dir = jdk_relative_dir();
    let jdtls_config_dir = jdtls_config_relative_dir();
    push(format!("[startup] jdk_relative_dir: {}", jdk_dir));
    push(format!("[startup] jdtls_config_dir: {}", jdtls_config_dir));

    for relative in [
        jdk_dir,
        &java_executable_name(),
        &javac_executable_name(),
        "java-parser/parser-bridge.jar",
        "jshell-bridge/jshell-bridge.jar",
        "jdtls",
        "jdtls/plugins",
        jdtls_config_dir,
    ] {
        push(format!("[startup] resource candidates for: {}", relative));
        for candidate in resource_candidates(app, relative) {
            let status = if candidate.exists() { "ok" } else { "missing" };
            push(format!("  - {} [{}]", candidate.display(), status));
        }
        if let Some(resolved) = resolve_resource(app, relative) {
            push(format!("[startup] resolved: {}", resolved.display()));
        } else {
            push(format!("[startup] resolved: <none>"));
        }
    }

    for line in &lines {
        println!("{}", line);
    }
    if let Some(state) = app.try_state::<StartupLogState>() {
        if let Ok(mut guard) = state.lines.lock() {
            guard.extend(lines);
        }
    }
}

#[tauri::command]
fn take_startup_logs(state: tauri::State<StartupLogState>) -> Vec<String> {
    let mut guard = match state.lines.lock() {
        Ok(guard) => guard,
        Err(error) => error.into_inner(),
    };
    let mut out = Vec::new();
    std::mem::swap(&mut *guard, &mut out);
    out
}

#[tauri::command]
fn take_launch_open_paths(state: tauri::State<LaunchOpenState>) -> Vec<String> {
    let mut guard = match state.pending_paths.lock() {
        Ok(guard) => guard,
        Err(error) => error.into_inner(),
    };
    let mut out = Vec::new();
    std::mem::swap(&mut *guard, &mut out);
    out
}

fn terminate_child_process(child: &mut std::process::Child) {
    match child.try_wait() {
        Ok(Some(_)) => {}
        _ => {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn shutdown_run_process(state: &RunState) {
    if let Ok(mut guard) = state.current.lock() {
        if let Some(mut handle) = guard.take() {
            terminate_child_process(&mut handle.child);
        }
    }
}

fn shutdown_jshell(state: &JshellState) {
    if let Ok(mut guard) = state.current.lock() {
        if let Some(mut session) = guard.take() {
            terminate_child_process(&mut session.child);
        }
    }
}

fn shutdown_parser_bridge(state: &ParserBridgeState) {
    if let Ok(mut guard) = state.current.lock() {
        if let Some(mut session) = guard.take() {
            terminate_child_process(&mut session.child);
        }
    }
}

fn shutdown_background_processes(app: &tauri::AppHandle) {
    let run_state = app.state::<RunState>();
    shutdown_run_process(&run_state);

    let jshell_state = app.state::<JshellState>();
    shutdown_jshell(&jshell_state);

    let parser_state = app.state::<ParserBridgeState>();
    shutdown_parser_bridge(&parser_state);

    let ls_state = app.state::<ls::LsState>();
    let _ = ls::shutdown(&ls_state);
}

fn main() {
    let app = tauri::Builder::default()
        .manage(StartupLogState::default())
        .manage(LaunchOpenState::default())
        .setup(|app| {
            let settings = load_startup_settings(app.handle());
            let launch_paths = collect_startup_umz_paths();
            queue_launch_open_paths(app.handle(), launch_paths);
            if settings.advanced.debug_logging {
                log_startup_diagnostics(app.handle());
            }
            Ok(())
        })
        .manage(RunState {
            current: Arc::new(Mutex::new(None)),
            run_id: AtomicU64::new(0),
        })
        .manage(ParserBridgeState::default())
        .manage(JshellState::default())
        .manage(ls::LsState::default())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_project_tree,
            read_text_file,
            write_text_file,
            write_binary_file,
            remove_text_file,
            open_packed_project,
            create_packed_project,
            create_scratch_project,
            save_packed_project,
            export_netbeans_project,
            compile_project,
            run_main,
            cancel_run,
            jshell_start,
            jshell_stop,
            jshell_eval,
            jshell_inspect,
            jshell_vars,
            read_settings,
            write_settings,
            parse_uml_graph,
            add_field_to_class,
            add_constructor_to_class,
            add_method_to_class,
            create_netbeans_project,
            ls::ls_start,
            ls::ls_stop,
            ls::ls_did_open,
            ls::ls_did_change,
            ls::ls_did_close,
            ls::ls_format_document,
            take_startup_logs,
            take_launch_open_paths
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    let mut cleaned_up = false;
    app.run(move |app, event| {
            if !cleaned_up {
                if matches!(
                    event,
                    tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
                ) {
                    shutdown_background_processes(app);
                    cleaned_up = true;
                }
            }
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = event {
                let paths = urls
                    .iter()
                    .filter_map(|url| parse_launch_umz_arg(url.as_str()))
                    .collect::<Vec<String>>();
                queue_launch_open_paths(app, paths);
            }
            #[cfg(not(any(target_os = "macos", target_os = "ios")))]
            let _ = (app, event);
        });
}
