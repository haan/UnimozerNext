use std::{
    fs, io,
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use tauri::{AppHandle, Manager};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

use crate::command_error::{to_command_error, CommandResult};
use crate::workspace_session::WorkspaceSessionState;

// Retry count when cleaning an existing extracted project workspace.
const WORKSPACE_CLEANUP_RETRIES: usize = 6;

// Delay between workspace cleanup retries.
const WORKSPACE_CLEANUP_RETRY_DELAY_MS: u64 = 120;

// Max number of fallback workspace names we try if the primary workspace stays locked.
const WORKSPACE_FALLBACK_SUFFIX_ATTEMPTS: usize = 32;

// Retention window for old per-process workspace sessions.
const WORKSPACE_SESSION_RETENTION_HOURS: u64 = 24 * 14;

const WORKSPACE_ROOT_DIRS: [&str; 2] = ["packed-workspaces", "scratch-workspaces"];

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

fn workspace_session_id(app: &AppHandle) -> String {
    app.try_state::<WorkspaceSessionState>()
        .map(|state| state.id().to_string())
        .unwrap_or_else(|| "session-unknown".to_string())
}

fn now_unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn parse_session_start_ms(session_id: &str) -> Option<u128> {
    let mut parts = session_id.split('-');
    let prefix = parts.next()?;
    if prefix != "session" {
        return None;
    }
    let _pid = parts.next()?;
    let started_ms = parts.next()?;
    if parts.next().is_some() {
        return None;
    }
    started_ms.parse::<u128>().ok()
}

fn is_stale_workspace_session(session_id: &str, now_ms: u128) -> bool {
    let Some(started_ms) = parse_session_start_ms(session_id) else {
        return false;
    };
    let age_ms = now_ms.saturating_sub(started_ms);
    let retention_ms = (WORKSPACE_SESSION_RETENTION_HOURS as u128) * 60 * 60 * 1000;
    age_ms > retention_ms
}

fn cleanup_stale_workspace_sessions(app: &AppHandle) {
    let local_data = match app.path().app_local_data_dir() {
        Ok(path) => path,
        Err(_) => return,
    };
    let current_session = workspace_session_id(app);
    let now_ms = now_unix_ms();

    for root_dir in WORKSPACE_ROOT_DIRS {
        let root_path = local_data.join(root_dir);
        let entries = match fs::read_dir(&root_path) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let session_path = entry.path();
            if !session_path.is_dir() {
                continue;
            }

            let session_name = entry.file_name().to_string_lossy().to_string();
            if session_name == current_session {
                continue;
            }
            if !is_stale_workspace_session(&session_name, now_ms) {
                continue;
            }

            let _ = fs::remove_dir_all(session_path);
        }
    }
}

pub fn cleanup_stale_workspace_sessions_async(app: AppHandle) {
    std::thread::spawn(move || {
        cleanup_stale_workspace_sessions(&app);
    });
}

pub fn sanitize_project_name(name: &str) -> String {
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

pub fn packed_workspace_dir(app: &AppHandle, archive_path: &Path) -> CommandResult<PathBuf> {
    let local_data = app.path().app_local_data_dir().map_err(to_command_error)?;
    let workspace_root = local_data
        .join("packed-workspaces")
        .join(workspace_session_id(app));
    fs::create_dir_all(&workspace_root).map_err(to_command_error)?;

    let stem = archive_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("project");
    let safe_stem = sanitize_project_name(stem);
    let hash = stable_hash(&archive_path.to_string_lossy());
    Ok(workspace_root.join(format!("{}-{:016x}", safe_stem, hash)))
}

pub fn packed_workspace_session_root(app: &AppHandle) -> CommandResult<PathBuf> {
    let local_data = app.path().app_local_data_dir().map_err(to_command_error)?;
    let workspace_root = local_data
        .join("packed-workspaces")
        .join(workspace_session_id(app));
    fs::create_dir_all(&workspace_root).map_err(to_command_error)?;
    Ok(workspace_root)
}

pub fn scratch_workspace_root(app: &AppHandle) -> CommandResult<PathBuf> {
    let local_data = app.path().app_local_data_dir().map_err(to_command_error)?;
    let workspace_root = local_data
        .join("scratch-workspaces")
        .join(workspace_session_id(app));
    fs::create_dir_all(&workspace_root).map_err(to_command_error)?;
    Ok(workspace_root)
}

fn recreate_workspace_dir(path: &Path) -> io::Result<()> {
    if path.exists() {
        fs::remove_dir_all(path)?;
    }
    fs::create_dir_all(path)?;
    Ok(())
}

pub fn prepare_workspace_dir(base_workspace: &Path) -> CommandResult<PathBuf> {
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
            .map_err(to_command_error)?
            .as_millis();
        let candidate = parent.join(format!(
            "{}-session-{}-{}",
            base_name,
            timestamp,
            attempt + 1
        ));
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

pub fn prepare_fixed_workspace_dir(path: &Path) -> CommandResult<()> {
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

fn normalize_for_compare(path: &Path) -> String {
    let text = path.to_string_lossy().to_string();
    if cfg!(target_os = "windows") {
        text.to_lowercase()
    } else {
        text
    }
}

fn collect_pack_paths(
    base_parent: &Path,
    current: &Path,
    out: &mut Vec<PathBuf>,
) -> io::Result<()> {
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
        children
            .sort_by(|left, right| normalize_for_compare(left).cmp(&normalize_for_compare(right)));
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

pub fn write_packed_archive(project_root: &Path, archive_path: &Path) -> CommandResult<()> {
    if !project_root.is_dir() {
        return Err("Project root directory not found".to_string());
    }
    let base_parent = project_root
        .parent()
        .ok_or_else(|| "Project root has no parent directory".to_string())?;
    let archive_root_name = archive_root_name_from_path(archive_path);

    let mut paths = Vec::new();
    collect_pack_paths(base_parent, project_root, &mut paths).map_err(to_command_error)?;
    if paths.is_empty() {
        return Err("Project root is empty".to_string());
    }

    if let Some(parent) = archive_path.parent() {
        fs::create_dir_all(parent).map_err(to_command_error)?;
    }

    let temp_path = build_archive_temp_path(archive_path);
    if temp_path.exists() {
        let _ = fs::remove_file(&temp_path);
    }

    let result = (|| -> CommandResult<()> {
        let temp_file = fs::File::create(&temp_path).map_err(to_command_error)?;
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
                    .map_err(to_command_error)?;
            } else {
                zip.start_file(entry_name, file_options)
                    .map_err(to_command_error)?;
                let mut source = fs::File::open(&path).map_err(to_command_error)?;
                io::copy(&mut source, &mut zip).map_err(to_command_error)?;
            }
        }

        zip.finish().map_err(to_command_error)?;
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
            fs::remove_file(&backup_path).map_err(to_command_error)?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};
    use zip::ZipArchive;

    fn create_temp_dir(label: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock before unix epoch")
            .as_millis();
        let dir = std::env::temp_dir().join(format!(
            "unimozer-next-{label}-{}-{timestamp}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn sanitize_project_name_normalizes_invalid_chars() {
        assert_eq!(sanitize_project_name("My Project"), "My_Project");
        assert_eq!(sanitize_project_name("A-B_C"), "A-B_C");
        assert_eq!(sanitize_project_name("   "), "project");
    }

    #[test]
    fn remap_archive_entry_name_uses_archive_root_name() {
        let relative = Path::new("UnsavedProject/src/Main.java");
        assert_eq!(
            remap_archive_entry_name(relative, "NumberPuzzle"),
            "NumberPuzzle/src/Main.java"
        );
        assert_eq!(
            remap_archive_entry_name(Path::new("UnsavedProject"), "NumberPuzzle"),
            "NumberPuzzle"
        );
    }

    #[test]
    fn should_skip_packed_relative_skips_build_artifacts_but_not_root() {
        assert!(should_skip_packed_relative(Path::new(
            "Project/target/classes"
        )));
        assert!(!should_skip_packed_relative(Path::new(
            "Project/src/Main.java"
        )));
        assert!(!should_skip_packed_relative(Path::new(
            "target/src/Main.java"
        )));
    }

    #[test]
    fn write_packed_archive_uses_archive_stem_and_skips_target_dir() {
        let temp_root = create_temp_dir("archive");
        let project_root = temp_root.join("UnsavedProject");
        let src_dir = project_root.join("src");
        let target_dir = project_root.join("target");
        fs::create_dir_all(&src_dir).expect("create src");
        fs::create_dir_all(&target_dir).expect("create target");
        fs::write(src_dir.join("Main.java"), "class Main {}").expect("write java");
        fs::write(target_dir.join("Ignored.txt"), "ignore").expect("write ignored");

        let archive_path = temp_root.join("My Course.umz");
        write_packed_archive(&project_root, &archive_path).expect("write packed archive");

        let archive_file = fs::File::open(&archive_path).expect("open archive");
        let mut archive = ZipArchive::new(archive_file).expect("read archive");
        let mut names = Vec::new();
        for index in 0..archive.len() {
            names.push(
                archive
                    .by_index(index)
                    .expect("read archive entry")
                    .name()
                    .to_string(),
            );
        }

        assert!(names.iter().any(|name| name == "My_Course/"));
        assert!(names.iter().any(|name| name == "My_Course/src/Main.java"));
        assert!(!names.iter().any(|name| name.contains("/target/")));

        let _ = fs::remove_dir_all(&temp_root);
    }

    #[test]
    fn parse_session_start_ms_accepts_valid_session_id() {
        assert_eq!(
            parse_session_start_ms("session-1234-1700000000000"),
            Some(1_700_000_000_000)
        );
    }

    #[test]
    fn parse_session_start_ms_rejects_invalid_format() {
        assert_eq!(parse_session_start_ms("session-1234"), None);
        assert_eq!(parse_session_start_ms("legacy-session"), None);
    }

    #[test]
    fn is_stale_workspace_session_respects_retention_window() {
        let retention_ms = (WORKSPACE_SESSION_RETENTION_HOURS as u128) * 60 * 60 * 1000;
        let now_ms = 2_000_000_000_000u128;
        let stale_session = format!("session-42-{}", now_ms.saturating_sub(retention_ms + 1));
        let fresh_session = format!("session-42-{}", now_ms.saturating_sub(retention_ms - 1));
        assert!(is_stale_workspace_session(&stale_session, now_ms));
        assert!(!is_stale_workspace_session(&fresh_session, now_ms));
    }
}
