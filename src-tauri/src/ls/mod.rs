use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

mod jdtls;
mod jsonrpc;
mod uri;

// Maximum recursion depth when expanding nested `${property}` values.
const LS_PROPERTY_RESOLUTION_MAX_DEPTH: usize = 8;

// Timeout for LSP request/response roundtrips.
const LS_REQUEST_TIMEOUT_SECONDS: u64 = 15;

// Number of graceful wait checks before force-killing the LS process.
const LS_STOP_WAIT_ATTEMPTS: usize = 10;

// Delay between graceful wait checks during LS shutdown.
const LS_STOP_WAIT_INTERVAL_MS: u64 = 50;

// Poll interval for detecting unexpected LS process exits.
const LS_CRASH_POLL_INTERVAL_MS: u64 = 500;

// LSP `didOpen` version starts at 1.
const LS_DID_OPEN_INITIAL_VERSION: i32 = 1;

fn parse_properties(path: &std::path::Path) -> HashMap<String, String> {
    let mut values = HashMap::new();
    let Ok(contents) = std::fs::read_to_string(path) else {
        return values;
    };
    for line in contents.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with('!') {
            continue;
        }
        let separator = line
            .find('=')
            .or_else(|| line.find(':'))
            .unwrap_or(line.len());
        if separator == 0 || separator >= line.len() {
            continue;
        }
        let key = line[..separator].trim();
        let value = line[separator + 1..].trim();
        if !key.is_empty() {
            values.insert(key.to_string(), value.to_string());
        }
    }
    values
}

fn resolve_property_value(key: &str, props: &HashMap<String, String>, depth: usize) -> String {
    if depth > LS_PROPERTY_RESOLUTION_MAX_DEPTH {
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

fn ensure_eclipse_metadata(project_root: &std::path::Path) -> Result<(), String> {
    let project_file = project_root.join(".project");
    let classpath_file = project_root.join(".classpath");
    if project_file.exists() && classpath_file.exists() {
        return Ok(());
    }

    let nb_props = parse_properties(&project_root.join("nbproject").join("project.properties"));
    let raw_src_dir = nb_props
        .get("src.dir")
        .cloned()
        .unwrap_or_else(|| "src".to_string());
    let raw_output_dir = nb_props
        .get("build.classes.dir")
        .cloned()
        .unwrap_or_else(|| "build/classes".to_string());
    let src_dir = resolve_value(&raw_src_dir, &nb_props, 0);
    let output_dir = resolve_value(&raw_output_dir, &nb_props, 0);
    let project_name = project_root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("project");

    if !project_file.exists() {
        let contents = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<projectDescription>
  <name>{}</name>
  <comment></comment>
  <projects></projects>
  <buildSpec>
    <buildCommand>
      <name>org.eclipse.jdt.core.javabuilder</name>
      <arguments></arguments>
    </buildCommand>
  </buildSpec>
  <natures>
    <nature>org.eclipse.jdt.core.javanature</nature>
  </natures>
</projectDescription>
"#,
            project_name
        );
        std::fs::write(&project_file, contents).map_err(crate::command_error::to_command_error)?;
    }

    let needs_classpath_update = if classpath_file.exists() {
        match std::fs::read_to_string(&classpath_file) {
            Ok(existing) => existing.contains("${"),
            Err(_) => false,
        }
    } else {
        true
    };

    if needs_classpath_update {
        let contents = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<classpath>
  <classpathentry kind="src" path="{}"/>
  <classpathentry kind="con" path="org.eclipse.jdt.launching.JRE_CONTAINER"/>
  <classpathentry kind="output" path="{}"/>
</classpath>
"#,
            src_dir, output_dir
        );
        std::fs::write(&classpath_file, contents)
            .map_err(crate::command_error::to_command_error)?;
    }

    Ok(())
}

pub struct LsState {
    inner: Arc<Mutex<Option<LsProcess>>>,
    run_id: Arc<AtomicU64>,
}

impl Default for LsState {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(None)),
            run_id: Arc::new(AtomicU64::new(0)),
        }
    }
}

#[derive(Clone)]
struct LsClient {
    stdin: Arc<Mutex<ChildStdin>>,
    pending: Arc<Mutex<HashMap<u64, mpsc::Sender<Value>>>>,
    next_id: Arc<AtomicU64>,
}

impl LsClient {
    fn send_request(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst) + 1;
        let (tx, rx) = mpsc::channel();
        {
            let mut pending = self
                .pending
                .lock()
                .map_err(|_| "Failed to lock pending requests".to_string())?;
            pending.insert(id, tx);
        }

        let message = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params
        });
        self.write_message(message)?;

        rx.recv_timeout(Duration::from_secs(LS_REQUEST_TIMEOUT_SECONDS))
            .map_err(|_| "Timeout waiting for LS response".to_string())
    }

    fn send_notification(&self, method: &str, params: Value) -> Result<(), String> {
        let message = json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params
        });
        self.write_message(message)
    }

    fn write_message(&self, message: Value) -> Result<(), String> {
        let mut guard = self
            .stdin
            .lock()
            .map_err(|_| "Failed to lock LS stdin".to_string())?;
        let mut writer = jsonrpc::JsonRpcWriter::new(&mut *guard);
        writer
            .write_message(&message)
            .map_err(crate::command_error::to_command_error)
    }
}

struct LsProcess {
    child: Child,
    client: LsClient,
}

fn spawn_reader(
    app: AppHandle,
    stdout: impl std::io::Read + Send + 'static,
    pending: Arc<Mutex<HashMap<u64, mpsc::Sender<Value>>>>,
) {
    thread::spawn(move || {
        let mut reader = jsonrpc::JsonRpcReader::new(stdout);
        while let Ok(Some(message)) = reader.read_message() {
            if let Some(id) = message.get("id").and_then(|value| value.as_u64()) {
                if let Ok(mut pending) = pending.lock() {
                    if let Some(tx) = pending.remove(&id) {
                        let _ = tx.send(message);
                    }
                }
                continue;
            }
            if let Some(method) = message.get("method").and_then(|value| value.as_str()) {
                if method == "textDocument/publishDiagnostics" {
                    if let Some(params) = message.get("params") {
                        let _ = app.emit("ls_diagnostics", params.clone());
                    }
                }
            }
        }
    });
}

fn spawn_log_writer(stderr: impl std::io::Read + Send + 'static, log_path: PathBuf) {
    thread::spawn(move || {
        let file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path);
        let mut file = match file {
            Ok(file) => file,
            Err(_) => return,
        };
        let mut reader = std::io::BufReader::new(stderr);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => return,
                Ok(_) => {
                    let _ = file.write_all(line.as_bytes());
                }
                Err(_) => return,
            }
        }
    });
}

fn java_executable_path(app: &AppHandle) -> Result<PathBuf, String> {
    let java_rel = crate::java_tools::java_executable_name();
    jdtls::resolve_resource(app, &java_rel)
        .ok_or_else(|| "Bundled Java runtime not found".to_string())
}

fn start_ls(app: &AppHandle, project_root: PathBuf) -> Result<(LsProcess, PathBuf), String> {
    let java_path = java_executable_path(app)?;
    let (mut child, log_path) = jdtls::spawn_jdtls(app, &java_path, &project_root)?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture LS stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture LS stderr".to_string())?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Failed to capture LS stdin".to_string())?;

    let pending = Arc::new(Mutex::new(HashMap::new()));
    spawn_reader(app.clone(), stdout, pending.clone());
    spawn_log_writer(stderr, log_path.clone());

    let client = LsClient {
        stdin: Arc::new(Mutex::new(stdin)),
        pending,
        next_id: Arc::new(AtomicU64::new(0)),
    };

    let process = LsProcess { child, client };

    Ok((process, log_path))
}

fn initialize_ls(client: &LsClient, project_root: &PathBuf) -> Result<(), String> {
    let root_uri = uri::path_to_uri(project_root);
    let params = json!({
        "rootUri": root_uri,
        "capabilities": {
            "textDocument": {
                "synchronization": {
                    "didSave": true,
                    "willSave": false,
                    "willSaveWaitUntil": false,
                    "dynamicRegistration": false
                },
                "formatting": {
                    "dynamicRegistration": false
                }
            }
        },
        "workspaceFolders": [
            {
                "uri": root_uri,
                "name": project_root.file_name().and_then(|name| name.to_str()).unwrap_or("project")
            }
        ]
    });
    let _ = client.send_request("initialize", params)?;
    client.send_notification("initialized", json!({}))
}

fn stop_process(mut process: LsProcess) -> Result<(), String> {
    let _ = process.client.send_request("shutdown", json!({}));
    let _ = process.client.send_notification("exit", json!({}));

    for _ in 0..LS_STOP_WAIT_ATTEMPTS {
        match process.child.try_wait() {
            Ok(Some(_)) => return Ok(()),
            Ok(None) => thread::sleep(Duration::from_millis(LS_STOP_WAIT_INTERVAL_MS)),
            Err(_) => break,
        }
    }

    process
        .child
        .kill()
        .map_err(crate::command_error::to_command_error)?;
    Ok(())
}

pub fn shutdown(state: &LsState) -> Result<(), String> {
    state.run_id.fetch_add(1, Ordering::SeqCst);
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| "Failed to lock LS state".to_string())?;
    if let Some(process) = guard.take() {
        stop_process(process)?;
    }
    Ok(())
}

fn with_client<T>(
    state: &tauri::State<LsState>,
    f: impl FnOnce(&LsClient) -> Result<T, String>,
) -> Result<T, String> {
    let guard = state
        .inner
        .lock()
        .map_err(|_| "Failed to lock LS state".to_string())?;
    let Some(process) = guard.as_ref() else {
        return Err("LS is not running".to_string());
    };
    f(&process.client)
}

#[tauri::command]
pub fn ls_start(
    app: AppHandle,
    state: tauri::State<LsState>,
    project_root: String,
) -> Result<String, String> {
    let root_path = if project_root.starts_with("file://") {
        uri::uri_to_path(&project_root)
    } else {
        PathBuf::from(project_root)
    };
    if !root_path.is_dir() {
        return Err("Project root is not a directory".to_string());
    }

    ensure_eclipse_metadata(&root_path)?;

    let run_id = state.run_id.fetch_add(1, Ordering::SeqCst) + 1;
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| "Failed to lock LS state".to_string())?;
    if let Some(existing) = guard.take() {
        let _ = stop_process(existing);
    }

    let (process, log_path) = start_ls(&app, root_path.clone())?;
    let client = process.client.clone();
    *guard = Some(process);

    let app_handle = app.clone();
    let log_path_value = log_path.to_string_lossy().to_string();
    let inner = Arc::clone(&state.inner);
    let run_id_ref = Arc::clone(&state.run_id);
    let init_root = root_path.clone();
    let ready_root = root_path.to_string_lossy().to_string();
    thread::spawn(move || {
        let result = initialize_ls(&client, &init_root);
        match result {
            Ok(()) => {
                let _ = app_handle.emit(
                    "ls_ready",
                    json!({
                        "projectRoot": ready_root,
                        "logPath": log_path_value
                    }),
                );
            }
            Err(error) => {
                let _ = app_handle.emit(
                    "ls_error",
                    json!({
                        "projectRoot": ready_root,
                        "error": error,
                        "logPath": log_path_value
                    }),
                );
            }
        }
    });

    let crash_app = app.clone();
    let crash_root = root_path.to_string_lossy().to_string();
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(LS_CRASH_POLL_INTERVAL_MS));
        if run_id_ref.load(Ordering::SeqCst) != run_id {
            return;
        }
        let mut guard = match inner.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };
        let Some(process) = guard.as_mut() else {
            return;
        };
        match process.child.try_wait() {
            Ok(Some(status)) => {
                *guard = None;
                if run_id_ref.load(Ordering::SeqCst) == run_id {
                    let _ = crash_app.emit(
                        "ls_crashed",
                        json!({
                            "projectRoot": crash_root,
                            "code": status.code()
                        }),
                    );
                }
                return;
            }
            Ok(None) => {}
            Err(_) => {
                *guard = None;
                if run_id_ref.load(Ordering::SeqCst) == run_id {
                    let _ = crash_app.emit(
                        "ls_crashed",
                        json!({
                            "projectRoot": crash_root,
                            "code": null
                        }),
                    );
                }
                return;
            }
        }
    });

    Ok(log_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn ls_stop(state: tauri::State<LsState>) -> Result<(), String> {
    shutdown(&state)
}

#[tauri::command]
pub fn ls_did_open(
    state: tauri::State<LsState>,
    uri: String,
    text: String,
    language_id: String,
) -> Result<(), String> {
    let params = json!({
        "textDocument": {
            "uri": uri,
            "languageId": language_id,
            "version": LS_DID_OPEN_INITIAL_VERSION,
            "text": text
        }
    });
    with_client(&state, |client| {
        client.send_notification("textDocument/didOpen", params)
    })
}

#[tauri::command]
pub fn ls_did_change(
    state: tauri::State<LsState>,
    uri: String,
    version: i32,
    text: String,
) -> Result<(), String> {
    let params = json!({
        "textDocument": {
            "uri": uri,
            "version": version
        },
        "contentChanges": [
            { "text": text }
        ]
    });
    with_client(&state, |client| {
        client.send_notification("textDocument/didChange", params)
    })
}

#[tauri::command]
pub fn ls_did_close(state: tauri::State<LsState>, uri: String) -> Result<(), String> {
    let params = json!({
        "textDocument": {
            "uri": uri
        }
    });
    with_client(&state, |client| {
        client.send_notification("textDocument/didClose", params)
    })
}

#[tauri::command]
pub fn ls_format_document(
    state: tauri::State<LsState>,
    uri: String,
    tab_size: u32,
    insert_spaces: bool,
) -> Result<Value, String> {
    let params = json!({
        "textDocument": {
            "uri": uri
        },
        "options": {
            "tabSize": tab_size,
            "insertSpaces": insert_spaces
        }
    });
    let response = with_client(&state, |client| {
        client.send_request("textDocument/formatting", params)
    })?;
    if let Some(error) = response.get("error") {
        return Err(error.to_string());
    }
    Ok(response.get("result").cloned().unwrap_or_else(|| json!([])))
}
