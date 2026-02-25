use crate::command_error::{to_command_error, CommandResult};
use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
use std::{
    cmp::Ordering,
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
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

const FNV64_OFFSET_BASIS: u64 = 0xcbf29ce484222325;
const FNV64_PRIME: u64 = 0x100000001b3;
const DIRECTORY_TRAVERSAL_MAX_DEPTH: usize = 128;

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

    let mut active_dirs = HashSet::new();
    build_tree(&root_path, true, 0, &mut active_dirs)
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

#[tauri::command]
pub fn folder_java_files_change_token(root: String) -> CommandResult<String> {
    let root_path = PathBuf::from(&root);
    if !root_path.exists() {
        return Ok("missing".to_string());
    }
    if !root_path.is_dir() {
        return Err("Selected path is not a directory".to_string());
    }

    let mut entries: Vec<(String, u64, u128)> = Vec::new();
    let mut active_dirs = HashSet::new();
    collect_java_fingerprint_entries(
        &root_path,
        &root_path,
        true,
        0,
        &mut entries,
        &mut active_dirs,
    )
    .map_err(to_command_error)?;
    entries.sort_by(|a, b| a.0.cmp(&b.0));

    let mut hash = FNV64_OFFSET_BASIS;
    for (relative_path, file_size, modified_ms) in &entries {
        update_fnv64(&mut hash, relative_path.as_bytes());
        update_fnv64(&mut hash, &file_size.to_le_bytes());
        update_fnv64(&mut hash, &modified_ms.to_le_bytes());
    }

    Ok(format!("{hash:016x}:{}", entries.len()))
}

#[tauri::command]
pub fn file_change_token(path: String) -> CommandResult<String> {
    let file_path = PathBuf::from(&path);
    if !file_path.exists() {
        return Ok("missing".to_string());
    }

    let metadata = fs::metadata(&file_path).map_err(to_command_error)?;
    let mut hash = FNV64_OFFSET_BASIS;
    update_fnv64(&mut hash, file_path.to_string_lossy().as_bytes());
    update_fnv64(&mut hash, &metadata.len().to_le_bytes());
    update_fnv64(&mut hash, &modified_timestamp_ms(&metadata).to_le_bytes());
    Ok(format!("{hash:016x}"))
}

fn build_tree(
    path: &Path,
    is_root: bool,
    depth: usize,
    active_dirs: &mut HashSet<PathBuf>,
) -> io::Result<Option<FileNode>> {
    let metadata = fs::metadata(path)?;
    if metadata.is_dir() {
        if depth > DIRECTORY_TRAVERSAL_MAX_DEPTH {
            return Ok(None);
        }
        if !is_root && should_skip_dir(path) {
            return Ok(None);
        }

        let visit_key = directory_visit_key(path)?;
        if active_dirs.contains(&visit_key) {
            return Ok(None);
        }
        active_dirs.insert(visit_key.clone());

        let result = (|| -> io::Result<Option<FileNode>> {
            let mut children = Vec::new();
            for entry in fs::read_dir(path)? {
                let entry = entry?;
                let child_path = entry.path();
                if let Some(child) = build_tree(&child_path, false, depth + 1, active_dirs)? {
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
        })();

        active_dirs.remove(&visit_key);
        result
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

fn update_fnv64(hash: &mut u64, bytes: &[u8]) {
    for byte in bytes {
        *hash ^= u64::from(*byte);
        *hash = hash.wrapping_mul(FNV64_PRIME);
    }
}

fn modified_timestamp_ms(metadata: &fs::Metadata) -> u128 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn collect_java_fingerprint_entries(
    root: &Path,
    path: &Path,
    is_root: bool,
    depth: usize,
    entries: &mut Vec<(String, u64, u128)>,
    active_dirs: &mut HashSet<PathBuf>,
) -> io::Result<()> {
    let metadata = fs::metadata(path)?;
    if metadata.is_dir() {
        if depth > DIRECTORY_TRAVERSAL_MAX_DEPTH {
            return Ok(());
        }
        if !is_root && should_skip_dir(path) {
            return Ok(());
        }

        let visit_key = directory_visit_key(path)?;
        if active_dirs.contains(&visit_key) {
            return Ok(());
        }
        active_dirs.insert(visit_key.clone());

        let result = (|| -> io::Result<()> {
            for child in fs::read_dir(path)? {
                let child = child?;
                collect_java_fingerprint_entries(
                    root,
                    &child.path(),
                    false,
                    depth + 1,
                    entries,
                    active_dirs,
                )?;
            }
            Ok(())
        })();

        active_dirs.remove(&visit_key);
        return result;
    }

    if !metadata.is_file() {
        return Ok(());
    }

    let is_java = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("java"))
        .unwrap_or(false);
    if !is_java {
        return Ok(());
    }

    let relative = path
        .strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string();
    entries.push((relative, metadata.len(), modified_timestamp_ms(&metadata)));
    Ok(())
}

fn directory_visit_key(path: &Path) -> io::Result<PathBuf> {
    match fs::canonicalize(path) {
        Ok(canonical) => Ok(canonical),
        Err(_) => {
            if path.is_absolute() {
                Ok(path.to_path_buf())
            } else {
                Ok(std::env::current_dir()?.join(path))
            }
        }
    }
}
