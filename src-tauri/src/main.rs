#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::{
    cmp::Ordering,
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

mod ls;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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
struct UmlField {
    signature: String,
    #[serde(default)]
    is_static: bool,
    #[serde(default)]
    visibility: String,
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
    #[serde(default)]
    panel_background: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    uml: UmlSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            uml: UmlSettings {
                show_dependencies: true,
                panel_background: None,
            },
        }
    }
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ParseUmlGraphResponse {
    graph: UmlGraph,
    raw: String,
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
    fs::write(path, contents).map_err(|error| error.to_string())
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

#[tauri::command]
fn parse_uml_graph(
    app: tauri::AppHandle,
    root: String,
    src_root: String,
    overrides: Vec<SourceOverride>,
) -> Result<ParseUmlGraphResponse, String> {
    let java_rel = java_executable_name();
    let java_path = resolve_resource(&app, &java_rel)
        .ok_or_else(|| "Bundled Java runtime not found".to_string())?;
    let jar_path = resolve_resource(&app, "java-parser/parser-bridge.jar")
        .ok_or_else(|| "Java parser bridge not found".to_string())?;

    let request = ParserRequest {
        root,
        src_root,
        overrides,
    };

    let payload = serde_json::to_vec(&request).map_err(|error| error.to_string())?;

    let mut command = Command::new(java_path);
    command
        .arg("-jar")
        .arg(jar_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command.spawn().map_err(|error| error.to_string())?;

    if let Some(stdin) = child.stdin.as_mut() {
        stdin
            .write_all(&payload)
            .map_err(|error| error.to_string())?;
    }

    let output = child
        .wait_with_output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Parser bridge failed: {}", stderr.trim()));
    }

    let raw = String::from_utf8_lossy(&output.stdout).to_string();
    let graph = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    Ok(ParseUmlGraphResponse { graph, raw })
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
        sources_list.push_str(&format!("{}\n", file.display()));
    }

    let sources_file = build_dir.join("sources.txt");
    fs::write(&sources_file, sources_list).map_err(|error| error.to_string())?;

    let mut command = Command::new(javac_path);
    command
        .arg("-encoding")
        .arg("UTF-8")
        .arg("-d")
        .arg(&out_dir)
        .arg(format!("@{}", sources_file.display()))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = command.output().map_err(|error| error.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    Ok(CompileResult {
        ok: output.status.success(),
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

    let run_id = state.next_id();
    if let Ok(mut guard) = state.current.lock() {
        if let Some(handle) = guard.as_mut() {
            let _ = handle.child.kill();
        }
    }

    let mut command = Command::new(java_path);
    command
        .arg("-cp")
        .arg(&class_dir)
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

        std::thread::sleep(Duration::from_millis(200));
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
    }
    Ok(())
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
        const CHUNK_SIZE: usize = 8 * 1024;
        const MAX_EMIT_BYTES: usize = 200 * 1024;
        loop {
            line.clear();
            match buf.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => {
                    if emitted_bytes >= MAX_EMIT_BYTES {
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
                    if buffer.len() >= CHUNK_SIZE {
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
        if !buffer.is_empty() && emitted_bytes < MAX_EMIT_BYTES {
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

fn resolve_resource(app: &tauri::AppHandle, relative: &str) -> Option<PathBuf> {
    if let Ok(dir) = app.path().resource_dir() {
        let candidate: PathBuf = dir.join(relative);
        if candidate.exists() {
            return Some(candidate);
        }
    }

    let fallback = PathBuf::from("resources").join(relative);
    if fallback.exists() {
        return Some(fallback);
    }

    let dev_fallback = PathBuf::from("..").join("resources").join(relative);
    if dev_fallback.exists() {
        return Some(dev_fallback);
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

fn main() {
    tauri::Builder::default()
        .manage(RunState {
            current: Arc::new(Mutex::new(None)),
            run_id: AtomicU64::new(0),
        })
        .manage(ls::LsState::default())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_project_tree,
            read_text_file,
            write_text_file,
            export_netbeans_project,
            compile_project,
            run_main,
            cancel_run,
            read_settings,
            write_settings,
            parse_uml_graph,
            ls::ls_start,
            ls::ls_stop
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
