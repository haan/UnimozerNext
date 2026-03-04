use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use url::Url;

use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
pub struct StartupLogState {
    lines: Arc<Mutex<Vec<String>>>,
}

#[derive(Default)]
pub struct LaunchOpenState {
    pending_paths: Arc<Mutex<Vec<String>>>,
}

fn parse_file_uri_path(raw: &str) -> Option<PathBuf> {
    let parsed = Url::parse(raw).ok()?;
    if parsed.scheme() != "file" {
        return None;
    }
    parsed.to_file_path().ok()
}

pub fn parse_launch_umz_arg(raw: &str) -> Option<String> {
    let trimmed = raw.trim().trim_matches('"');
    if trimmed.is_empty() || trimmed.starts_with('-') {
        return None;
    }
    let path = parse_file_uri_path(trimmed).unwrap_or_else(|| PathBuf::from(trimmed));
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    if extension.as_deref() != Some("umz") {
        return None;
    }
    Some(path.to_string_lossy().to_string())
}

pub fn collect_startup_umz_paths() -> Vec<String> {
    collect_umz_paths_from_args(
        std::env::args_os()
            .skip(1)
            .map(|item| item.to_string_lossy().into_owned()),
    )
}

fn collect_umz_paths_from_args(args: impl IntoIterator<Item = String>) -> Vec<String> {
    args.into_iter()
        .filter_map(|item| parse_launch_umz_arg(item.as_str()))
        .collect()
}

pub fn queue_launch_open_paths(app: &AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    if let Some(state) = app.try_state::<LaunchOpenState>() {
        if let Ok(mut guard) = state.pending_paths.lock() {
            guard.extend(paths);
        }
    }
    let _ = app.emit("launch-open-paths-available", ());
}

pub fn append_startup_logs(app: &AppHandle, lines: &[String]) {
    if let Some(state) = app.try_state::<StartupLogState>() {
        if let Ok(mut guard) = state.lines.lock() {
            guard.extend(lines.iter().cloned());
        }
    }
}

#[tauri::command]
pub fn take_startup_logs(state: State<StartupLogState>) -> Vec<String> {
    let mut guard = match state.lines.lock() {
        Ok(guard) => guard,
        Err(error) => error.into_inner(),
    };
    let mut out = Vec::new();
    std::mem::swap(&mut *guard, &mut out);
    out
}

#[tauri::command]
pub fn take_launch_open_paths(state: State<LaunchOpenState>) -> Vec<String> {
    let mut guard = match state.pending_paths.lock() {
        Ok(guard) => guard,
        Err(error) => error.into_inner(),
    };
    let mut out = Vec::new();
    std::mem::swap(&mut *guard, &mut out);
    out
}

#[cfg(test)]
mod tests {
    use super::{collect_umz_paths_from_args, parse_launch_umz_arg};

    #[test]
    fn parse_launch_arg_accepts_plain_umz_path() {
        let parsed = parse_launch_umz_arg(r#"C:\Users\Student\A.umz"#);
        assert!(parsed.is_some());
        let value = parsed.expect("expected umz path");
        assert!(value.to_ascii_lowercase().ends_with(".umz"));
    }

    #[test]
    fn parse_launch_arg_accepts_quoted_umz_path() {
        let parsed = parse_launch_umz_arg(r#""C:\Users\Student\A.umz""#);
        assert!(parsed.is_some());
        let value = parsed.expect("expected quoted umz path");
        assert!(value.to_ascii_lowercase().ends_with(".umz"));
    }

    #[test]
    fn parse_launch_arg_accepts_file_uri_umz_path() {
        let parsed = parse_launch_umz_arg("file:///C:/Users/Student/A%20B.umz");
        assert!(parsed.is_some());
        let value = parsed.expect("expected file uri umz path");
        assert!(value.contains("A B.umz"));
        assert!(value.to_ascii_lowercase().ends_with(".umz"));
    }

    #[test]
    fn parse_launch_arg_rejects_flags_and_non_umz() {
        assert!(parse_launch_umz_arg("--inspect").is_none());
        assert!(parse_launch_umz_arg("C:\\Users\\Student\\A.java").is_none());
        assert!(parse_launch_umz_arg("").is_none());
    }

    #[test]
    fn collect_umz_paths_filters_invalid_entries() {
        let paths = collect_umz_paths_from_args(vec![
            "--flag".to_string(),
            "C:\\Users\\Student\\A.umz".to_string(),
            "C:\\Users\\Student\\B.java".to_string(),
            "file:///C:/Users/Student/C%20D.umz".to_string(),
        ]);
        assert_eq!(paths.len(), 2);
        assert!(paths
            .iter()
            .all(|item| item.to_ascii_lowercase().ends_with(".umz")));
    }
}
