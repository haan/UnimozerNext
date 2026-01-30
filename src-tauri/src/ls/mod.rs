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

pub struct LsState {
    inner: Mutex<Option<LsProcess>>,
}

impl Default for LsState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(None),
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

        rx.recv_timeout(Duration::from_secs(15))
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
            .map_err(|error| error.to_string())
    }
}

struct LsProcess {
    child: Child,
    client: LsClient,
}

fn spawn_reader(stdout: impl std::io::Read + Send + 'static, pending: Arc<Mutex<HashMap<u64, mpsc::Sender<Value>>>>) {
    thread::spawn(move || {
        let mut reader = jsonrpc::JsonRpcReader::new(stdout);
        while let Ok(Some(message)) = reader.read_message() {
            if let Some(id) = message.get("id").and_then(|value| value.as_u64()) {
                if let Ok(mut pending) = pending.lock() {
                    if let Some(tx) = pending.remove(&id) {
                        let _ = tx.send(message);
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
    let java_rel = crate::java_executable_name();
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
    spawn_reader(stdout, pending.clone());
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

    for _ in 0..30 {
        match process.child.try_wait() {
            Ok(Some(_)) => return Ok(()),
            Ok(None) => thread::sleep(Duration::from_millis(100)),
            Err(_) => break,
        }
    }

    process
        .child
        .kill()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn ls_start(app: AppHandle, state: tauri::State<LsState>, project_root: String) -> Result<String, String> {
    let root_path = if project_root.starts_with("file://") {
        uri::uri_to_path(&project_root)
    } else {
        PathBuf::from(project_root)
    };
    if !root_path.is_dir() {
        return Err("Project root is not a directory".to_string());
    }

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
    thread::spawn(move || {
        let result = initialize_ls(&client, &root_path);
        match result {
            Ok(()) => {
                let _ = app_handle.emit(
                    "ls_ready",
                    json!({
                        "projectRoot": root_path.to_string_lossy(),
                        "logPath": log_path_value
                    }),
                );
            }
            Err(error) => {
                let _ = app_handle.emit(
                    "ls_error",
                    json!({
                        "projectRoot": root_path.to_string_lossy(),
                        "error": error,
                        "logPath": log_path_value
                    }),
                );
            }
        }
    });

    Ok(log_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn ls_stop(state: tauri::State<LsState>) -> Result<(), String> {
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| "Failed to lock LS state".to_string())?;
    if let Some(process) = guard.take() {
        stop_process(process)?;
    }
    Ok(())
}
