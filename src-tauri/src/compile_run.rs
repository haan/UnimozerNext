use serde::Serialize;
use std::{
    fs,
    io::{BufRead, BufReader, Read},
    path::PathBuf,
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering as AtomicOrdering},
        Arc, Mutex,
    },
    time::Duration,
};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use tauri::{Emitter, State};

use crate::java_tools::{
    collect_java_files, java_executable_name, javac_executable_name, join_classpath,
    resolve_project_classpath, resolve_project_src_root, resolve_resource,
};
use crate::shared_types::SourceOverride;
use crate::{RUN_OUTPUT_CHUNK_SIZE_BYTES, RUN_OUTPUT_MAX_EMIT_BYTES, RUN_POLL_INTERVAL_MS};
#[cfg(target_os = "windows")]
use crate::CREATE_NO_WINDOW;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileResult {
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

struct RunHandle {
    id: u64,
    child: std::process::Child,
}

pub struct RunState {
    current: Arc<Mutex<Option<RunHandle>>>,
    run_id: AtomicU64,
}

impl RunState {
    pub fn new() -> Self {
        Self {
            current: Arc::new(Mutex::new(None)),
            run_id: AtomicU64::new(0),
        }
    }

    fn next_id(&self) -> u64 {
        self.run_id.fetch_add(1, AtomicOrdering::SeqCst) + 1
    }
}

#[tauri::command]
pub fn compile_project(
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
        fs::remove_dir_all(&out_dir).map_err(crate::command_error::to_command_error)?;
    }
    fs::create_dir_all(&out_dir).map_err(crate::command_error::to_command_error)?;

    let mut java_files = Vec::new();
    collect_java_files(&src_root_path, &mut java_files).map_err(crate::command_error::to_command_error)?;

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
    fs::write(&sources_file, sources_list).map_err(crate::command_error::to_command_error)?;

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

    let mut child = command.spawn().map_err(crate::command_error::to_command_error)?;
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

    let status = child.wait().map_err(crate::command_error::to_command_error)?;
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
pub fn run_main(
    app: tauri::AppHandle,
    state: State<RunState>,
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

    let mut child = command.spawn().map_err(crate::command_error::to_command_error)?;
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
pub fn cancel_run(state: State<RunState>) -> Result<(), String> {
    let mut guard = state
        .current
        .lock()
        .map_err(|_| "Failed to lock run state".to_string())?;
    if let Some(handle) = guard.as_mut() {
        handle.child.kill().map_err(crate::command_error::to_command_error)?;
        let _ = handle.child.wait();
    }
    Ok(())
}

pub fn shutdown_run_process(state: &RunState) {
    if let Ok(mut guard) = state.current.lock() {
        if let Some(mut handle) = guard.take() {
            match handle.child.try_wait() {
                Ok(Some(_)) => {}
                _ => {
                    let _ = handle.child.kill();
                    let _ = handle.child.wait();
                }
            }
        }
    }
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

