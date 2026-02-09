use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};

use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
pub struct StartupLogState {
    lines: Arc<Mutex<Vec<String>>>,
}

#[derive(Default)]
pub struct LaunchOpenState {
    pending_paths: Arc<Mutex<Vec<String>>>,
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index = 0usize;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hi = bytes[index + 1];
            let lo = bytes[index + 2];
            let hi_val = (hi as char).to_digit(16);
            let lo_val = (lo as char).to_digit(16);
            if let (Some(hi_val), Some(lo_val)) = (hi_val, lo_val) {
                out.push(((hi_val << 4) as u8) | (lo_val as u8));
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn parse_file_uri_path(raw: &str) -> Option<PathBuf> {
    let prefix = "file://";
    if !raw
        .get(..prefix.len())
        .map(|value| value.eq_ignore_ascii_case(prefix))
        .unwrap_or(false)
    {
        return None;
    }

    let mut body = &raw[prefix.len()..];
    if body
        .get(..10)
        .map(|value| value.eq_ignore_ascii_case("localhost/"))
        .unwrap_or(false)
    {
        body = &body[10..];
    }
    if body.is_empty() {
        return None;
    }

    let decoded = percent_decode(body);
    #[cfg(target_os = "windows")]
    {
        let mut normalized = decoded;
        if normalized.starts_with('/') && normalized.chars().nth(2) == Some(':') {
            normalized = normalized[1..].to_string();
        } else if !normalized.starts_with('/') && !normalized.contains(':') {
            normalized = format!(r"\\{}", normalized);
        }
        return Some(PathBuf::from(normalized.replace('/', "\\")));
    }
    #[cfg(not(target_os = "windows"))]
    {
        Some(PathBuf::from(decoded))
    }
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
        assert!(paths.iter().all(|item| item.to_ascii_lowercase().ends_with(".umz")));
    }
}
