use crate::command_error::{to_command_error, CommandResult};
use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
use std::{
    cmp::Ordering,
    fs, io,
    path::{Path, PathBuf},
};

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    name: String,
    path: String,
    kind: String,
    children: Option<Vec<FileNode>>,
}

#[tauri::command]
pub fn list_project_tree(root: String) -> CommandResult<FileNode> {
    let root_path = PathBuf::from(&root);
    if !root_path.is_dir() {
        return Err("Selected path is not a directory".to_string());
    }

    build_tree(&root_path, true)
        .map_err(to_command_error)?
        .ok_or_else(|| "No Java files found".to_string())
}

#[tauri::command]
pub fn read_text_file(path: String) -> CommandResult<String> {
    fs::read_to_string(path).map_err(to_command_error)
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> CommandResult<()> {
    let path = PathBuf::from(path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(to_command_error)?;
    }
    fs::write(path, contents).map_err(to_command_error)
}

#[tauri::command]
pub fn write_binary_file(path: String, contents_base64: String) -> CommandResult<()> {
    let path = PathBuf::from(path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(to_command_error)?;
    }
    let trimmed = contents_base64.trim();
    let payload = trimmed
        .strip_prefix("data:image/png;base64,")
        .unwrap_or(trimmed);
    let bytes = general_purpose::STANDARD
        .decode(payload)
        .map_err(to_command_error)?;
    fs::write(path, bytes).map_err(to_command_error)
}

#[tauri::command]
pub fn remove_text_file(path: String) -> CommandResult<()> {
    fs::remove_file(path).map_err(to_command_error)
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

