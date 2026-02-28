use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::command_error::{to_command_error, CommandResult};

const FRONTEND_CRASH_LOG_FILE: &str = "frontend-crash.log";
const FRONTEND_CRASH_LOG_ARCHIVE_FILE: &str = "frontend-crash.log.1";
const FRONTEND_CRASH_LOG_MAX_BYTES: u64 = 1024 * 1024;
const FRONTEND_CRASH_LINE_MAX_CHARS: usize = 4000;

fn crash_log_path(app: &AppHandle) -> CommandResult<PathBuf> {
    let data_dir = app.path().app_data_dir().map_err(to_command_error)?;
    Ok(data_dir.join(FRONTEND_CRASH_LOG_FILE))
}

#[tauri::command]
pub fn get_crash_log_path(app: AppHandle) -> CommandResult<String> {
    let path = crash_log_path(&app)?;
    Ok(path.to_string_lossy().to_string())
}

fn rotate_if_needed(path: &Path) -> std::io::Result<()> {
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    if metadata.len() < FRONTEND_CRASH_LOG_MAX_BYTES {
        return Ok(());
    }
    let archive_path = path.with_file_name(FRONTEND_CRASH_LOG_ARCHIVE_FILE);
    if archive_path.exists() {
        fs::remove_file(&archive_path)?;
    }
    fs::rename(path, archive_path)?;
    Ok(())
}

fn normalize_lines(lines: Vec<String>) -> Vec<String> {
    let mut out = Vec::new();
    for line in lines {
        for segment in line.replace('\r', "").lines() {
            let clipped: String = segment.chars().take(FRONTEND_CRASH_LINE_MAX_CHARS).collect();
            out.push(clipped);
        }
    }
    out
}

#[tauri::command]
pub fn append_crash_log(app: AppHandle, lines: Vec<String>) -> CommandResult<()> {
    let normalized = normalize_lines(lines);
    if normalized.is_empty() {
        return Ok(());
    }

    let path = crash_log_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(to_command_error)?;
    }
    rotate_if_needed(path.as_path()).map_err(to_command_error)?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(to_command_error)?;
    for line in normalized {
        writeln!(file, "{}", line).map_err(to_command_error)?;
    }
    Ok(())
}
