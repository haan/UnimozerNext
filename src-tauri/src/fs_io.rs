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
use walkdir::WalkDir;
#[cfg(target_os = "windows")]
use {
    std::ffi::OsStr,
    std::os::windows::ffi::OsStrExt,
    windows_sys::Win32::Foundation::{ERROR_MORE_DATA, NO_ERROR},
    windows_sys::Win32::NetworkManagement::WNet::WNetGetConnectionW,
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

#[cfg(target_os = "windows")]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowsMappedDriveAlias {
    drive: String,
    unc: String,
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
pub fn validate_folder_project_root(root: String) -> CommandResult<()> {
    let root_path = PathBuf::from(&root);
    if !root_path.exists() {
        return Err("Selected folder does not exist.".to_string());
    }
    if !root_path.is_dir() {
        return Err("Selected path is not a directory.".to_string());
    }

    // Deliberately only check for src/ rather than nbproject/ or project.xml.
    // Students work exclusively with NetBeans-style Java projects, so false
    // positives are not a realistic concern. The loose check also allows
    // opening folders that have Java source but lack IDE-generated metadata.
    if root_path.join("src").is_dir() {
        return Ok(());
    }

    Err("Selected folder is not a NetBeans project root. Missing required folder: src/".to_string())
}

#[tauri::command]
pub fn prefer_user_path(path: String) -> CommandResult<String> {
    #[cfg(target_os = "windows")]
    {
        Ok(prefer_windows_user_path(&path))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(path)
    }
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
    collect_java_fingerprint_entries(&root_path, &mut entries).map_err(to_command_error)?;
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

#[tauri::command]
pub fn resolve_file_uri(path: String) -> CommandResult<String> {
    let input_path = PathBuf::from(path);
    if input_path.as_os_str().is_empty() {
        return Err("Path is empty".to_string());
    }
    let canonical = fs::canonicalize(&input_path).unwrap_or(input_path);
    Ok(crate::ls::uri::path_to_uri(&canonical))
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

#[cfg(target_os = "windows")]
fn list_windows_mapped_drive_aliases() -> Vec<WindowsMappedDriveAlias> {
    let mut aliases = Vec::new();
    for code in b'A'..=b'Z' {
        let drive = format!("{}:", code as char);
        let local_name: Vec<u16> = OsStr::new(&drive)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let mut required_len = 0u32;
        let first_status = unsafe {
            WNetGetConnectionW(local_name.as_ptr(), std::ptr::null_mut(), &mut required_len)
        };
        if first_status != ERROR_MORE_DATA && first_status != NO_ERROR {
            continue;
        }
        if required_len == 0 {
            continue;
        }

        let mut remote_buffer = vec![0u16; required_len as usize];
        let second_status = unsafe {
            WNetGetConnectionW(local_name.as_ptr(), remote_buffer.as_mut_ptr(), &mut required_len)
        };
        if second_status != NO_ERROR {
            continue;
        }
        let remote_len = remote_buffer
            .iter()
            .position(|ch| *ch == 0)
            .unwrap_or(remote_buffer.len());
        if remote_len == 0 {
            continue;
        }

        let remote_share = String::from_utf16_lossy(&remote_buffer[..remote_len]);
        if !remote_share.starts_with(r"\\") {
            continue;
        }

        aliases.push(WindowsMappedDriveAlias {
            drive: drive.clone(),
            unc: remote_share,
        });
    }

    aliases.sort_by(|left, right| right.unc.len().cmp(&left.unc.len()));
    aliases
}

#[cfg(target_os = "windows")]
fn prefer_windows_user_path(path: &str) -> String {
    let normalized = path.replace('/', "\\");
    if !normalized.starts_with(r"\\") {
        return path.to_string();
    }

    let aliases = list_windows_mapped_drive_aliases();
    for alias in aliases {
        let unc_root = alias.unc.trim_end_matches('\\');
        if normalized.len() < unc_root.len() {
            continue;
        }
        let matches_root =
            normalized[..unc_root.len()].eq_ignore_ascii_case(unc_root)
                && (normalized.len() == unc_root.len()
                    || normalized.as_bytes().get(unc_root.len()) == Some(&b'\\'));
        if !matches_root {
            continue;
        }
        let suffix = if normalized.len() == unc_root.len() {
            ""
        } else {
            &normalized[unc_root.len()..]
        };
        return format!("{}{}", alias.drive, suffix);
    }

    path.to_string()
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
    entries: &mut Vec<(String, u64, u128)>,
) -> io::Result<()> {
    let walker = WalkDir::new(root)
        .max_depth(DIRECTORY_TRAVERSAL_MAX_DEPTH)
        .into_iter()
        .filter_entry(|entry| {
            if entry.depth() == 0 {
                return true;
            }
            if entry.file_type().is_dir() {
                return !should_skip_dir(entry.path());
            }
            true
        });

    for entry in walker {
        let entry = entry.map_err(io::Error::other)?;
        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        let is_java = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("java"))
            .unwrap_or(false);
        if !is_java {
            continue;
        }

        let metadata = entry.metadata().map_err(io::Error::other)?;
        let relative = path
            .strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();
        entries.push((relative, metadata.len(), modified_timestamp_ms(&metadata)));
    }

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_fnv64_empty_input_leaves_hash_unchanged() {
        let mut hash = FNV64_OFFSET_BASIS;
        update_fnv64(&mut hash, &[]);
        assert_eq!(hash, FNV64_OFFSET_BASIS);
    }

    #[test]
    fn update_fnv64_known_value_matches_fnv1a_spec() {
        // FNV-1a of b"abc" — pre-computed reference value.
        let mut hash = FNV64_OFFSET_BASIS;
        update_fnv64(&mut hash, b"abc");
        assert_eq!(hash, 0xe71fa2190541574b);
    }

    #[test]
    fn update_fnv64_is_deterministic() {
        let mut h1 = FNV64_OFFSET_BASIS;
        let mut h2 = FNV64_OFFSET_BASIS;
        update_fnv64(&mut h1, b"hello world");
        update_fnv64(&mut h2, b"hello world");
        assert_eq!(h1, h2);
    }

    #[test]
    fn update_fnv64_different_inputs_produce_different_hashes() {
        let mut h1 = FNV64_OFFSET_BASIS;
        let mut h2 = FNV64_OFFSET_BASIS;
        update_fnv64(&mut h1, b"foo");
        update_fnv64(&mut h2, b"bar");
        assert_ne!(h1, h2);
    }

    #[test]
    fn should_skip_dir_matches_known_skip_names() {
        assert!(should_skip_dir(Path::new("/some/project/node_modules")));
        assert!(should_skip_dir(Path::new("/some/project/target")));
        assert!(should_skip_dir(Path::new("/some/project/.git")));
        assert!(should_skip_dir(Path::new("/some/project/dist")));
        assert!(should_skip_dir(Path::new("/some/project/bin")));
    }

    #[test]
    fn should_skip_dir_does_not_skip_source_dirs() {
        assert!(!should_skip_dir(Path::new("/some/project/src")));
        assert!(!should_skip_dir(Path::new("/some/project/main")));
        assert!(!should_skip_dir(Path::new("/some/project/lib")));
    }

    #[test]
    fn should_skip_dir_is_case_insensitive() {
        assert!(should_skip_dir(Path::new("/some/project/NODE_MODULES")));
        assert!(should_skip_dir(Path::new("/some/project/Target")));
        assert!(should_skip_dir(Path::new("/some/project/DIST")));
    }

    #[test]
    fn should_skip_dir_returns_false_for_empty_path() {
        assert!(!should_skip_dir(Path::new("")));
    }
}
