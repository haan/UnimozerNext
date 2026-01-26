#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use serde::Serialize;
use std::{
  cmp::Ordering,
  fs,
  io,
  path::{Path, PathBuf}
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileNode {
  name: String,
  path: String,
  kind: String,
  children: Option<Vec<FileNode>>
}

const SKIP_DIRS: [&str; 8] = [
  "node_modules",
  "target",
  "dist",
  "out",
  ".git",
  ".idea",
  "bin",
  ".unimozer-next"
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
      _ => a.name.to_lowercase().cmp(&b.name.to_lowercase())
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
      children: Some(children)
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
      children: None
    }))
  } else {
    Ok(None)
  }
}

fn should_skip_dir(path: &Path) -> bool {
  match path.file_name().and_then(|segment| segment.to_str()) {
    Some(name) => SKIP_DIRS.iter().any(|skip| skip.eq_ignore_ascii_case(name)),
    None => false
  }
}

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      list_project_tree,
      read_text_file,
      write_text_file
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
