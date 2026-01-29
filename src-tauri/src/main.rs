#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use serde::{Deserialize, Serialize};
use std::io::Write;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::{
    cmp::Ordering,
    fs, io,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};
use tauri::Manager;

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
    is_abstract: bool,
    #[serde(default)]
    is_static: bool,
    #[serde(default)]
    visibility: String,
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
) -> Result<UmlGraph, String> {
    let java_path = resolve_resource(&app, java_executable_name())
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

    serde_json::from_slice(&output.stdout).map_err(|error| error.to_string())
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

fn java_executable_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "jdk/current/bin/java.exe"
    } else {
        "jdk/current/bin/java"
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
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_project_tree,
            read_text_file,
            write_text_file,
            export_netbeans_project,
            read_settings,
            write_settings,
            parse_uml_graph
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
