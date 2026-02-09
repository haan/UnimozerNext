use std::{
    collections::HashMap,
    fs, io,
    path::{Path, PathBuf},
};
use tauri::Manager;

// Maximum recursion depth when expanding property placeholders like `${key}`.
const PROPERTY_RESOLUTION_MAX_DEPTH: usize = 8;

pub(crate) fn jdk_relative_dir() -> &'static str {
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
    } else if cfg!(target_arch = "aarch64") {
        "jdk/linux-arm64"
    } else {
        "jdk/linux-x64"
    }
}

pub(crate) fn jdtls_config_relative_dir() -> &'static str {
    if cfg!(target_os = "windows") {
        "jdtls/config_win"
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "jdtls/config_mac_arm"
        } else {
            "jdtls/config_mac"
        }
    } else if cfg!(target_arch = "aarch64") {
        "jdtls/config_linux_arm"
    } else {
        "jdtls/config_linux"
    }
}

pub(crate) fn java_executable_name() -> String {
    if cfg!(target_os = "windows") {
        format!("{}/bin/java.exe", jdk_relative_dir())
    } else {
        format!("{}/bin/java", jdk_relative_dir())
    }
}

pub(crate) fn javac_executable_name() -> String {
    if cfg!(target_os = "windows") {
        format!("{}/bin/javac.exe", jdk_relative_dir())
    } else {
        format!("{}/bin/javac", jdk_relative_dir())
    }
}

fn parse_properties_with_continuations(path: &Path) -> HashMap<String, String> {
    let mut values = HashMap::new();
    let Ok(contents) = fs::read_to_string(path) else {
        return values;
    };
    let mut buffer = String::new();
    for raw_line in contents.lines() {
        let trimmed_end = raw_line.trim_end();
        if buffer.is_empty() {
            let trimmed_start = trimmed_end.trim_start();
            if trimmed_start.is_empty()
                || trimmed_start.starts_with('#')
                || trimmed_start.starts_with('!')
            {
                continue;
            }
        }
        let continues = trimmed_end.ends_with('\\');
        let segment = if continues {
            trimmed_end.trim_end_matches('\\')
        } else {
            trimmed_end
        };
        if buffer.is_empty() {
            buffer.push_str(segment.trim_start());
        } else {
            buffer.push_str(segment.trim_start());
        }
        if continues {
            continue;
        }
        let logical = buffer.trim().to_string();
        buffer.clear();
        let separator = logical
            .find('=')
            .or_else(|| logical.find(':'))
            .unwrap_or(logical.len());
        if separator == 0 || separator >= logical.len() {
            continue;
        }
        let key = logical[..separator].trim();
        let mut value = logical[separator + 1..].trim().to_string();
        if value.contains("\\\\") {
            value = value.replace("\\\\", "\\");
        }
        if !key.is_empty() {
            values.insert(key.to_string(), value);
        }
    }
    if !buffer.is_empty() {
        let logical = buffer.trim();
        let separator = logical
            .find('=')
            .or_else(|| logical.find(':'))
            .unwrap_or(logical.len());
        if separator > 0 && separator < logical.len() {
            let key = logical[..separator].trim();
            let mut value = logical[separator + 1..].trim().to_string();
            if value.contains("\\\\") {
                value = value.replace("\\\\", "\\");
            }
            if !key.is_empty() {
                values.insert(key.to_string(), value);
            }
        }
    }
    values
}

fn resolve_property_value(key: &str, props: &HashMap<String, String>, depth: usize) -> String {
    if depth > PROPERTY_RESOLUTION_MAX_DEPTH {
        return props.get(key).cloned().unwrap_or_default();
    }
    let Some(value) = props.get(key) else {
        return String::new();
    };
    resolve_value(value, props, depth + 1)
}

fn resolve_value(value: &str, props: &HashMap<String, String>, depth: usize) -> String {
    let mut output = String::new();
    let mut rest = value;
    while let Some(start) = rest.find("${") {
        let (before, after_start) = rest.split_at(start);
        output.push_str(before);
        let Some(end) = after_start.find('}') else {
            output.push_str(after_start);
            return output;
        };
        let key = &after_start[2..end];
        let replacement = resolve_property_value(key.trim(), props, depth + 1);
        output.push_str(&replacement);
        rest = &after_start[end + 1..];
    }
    output.push_str(rest);
    output
}

fn split_classpath(value: &str) -> Vec<String> {
    let mut entries = Vec::new();
    let mut current = String::new();
    let chars: Vec<char> = value.chars().collect();
    let mut index = 0;
    while index < chars.len() {
        let ch = chars[index];
        if ch == ';' {
            let trimmed = current.trim();
            if !trimmed.is_empty() {
                entries.push(trimmed.to_string());
            }
            current.clear();
            index += 1;
            continue;
        }
        if ch == ':' {
            let is_drive = index == 1
                && chars[0].is_ascii_alphabetic()
                && index + 1 < chars.len()
                && (chars[index + 1] == '\\' || chars[index + 1] == '/');
            if !is_drive {
                let trimmed = current.trim();
                if !trimmed.is_empty() {
                    entries.push(trimmed.to_string());
                }
                current.clear();
                index += 1;
                continue;
            }
        }
        current.push(ch);
        index += 1;
    }
    let trimmed = current.trim();
    if !trimmed.is_empty() {
        entries.push(trimmed.to_string());
    }
    entries
}

pub(crate) fn resolve_project_classpath(root: &Path, key: &str) -> Vec<PathBuf> {
    let props_path = root.join("nbproject").join("project.properties");
    let props = parse_properties_with_continuations(&props_path);
    let raw_value = props.get(key).cloned().unwrap_or_default();
    if raw_value.trim().is_empty() {
        return Vec::new();
    }
    let resolved = resolve_value(&raw_value, &props, 0);
    split_classpath(&resolved)
        .into_iter()
        .filter_map(|entry| {
            let trimmed = entry.trim();
            if trimmed.is_empty() {
                return None;
            }
            let path = PathBuf::from(trimmed);
            if path.is_absolute() {
                Some(path)
            } else {
                Some(root.join(path))
            }
        })
        .collect()
}

pub(crate) fn join_classpath(entries: &[PathBuf]) -> String {
    let separator = if cfg!(target_os = "windows") { ";" } else { ":" };
    entries
        .iter()
        .map(|entry| entry.to_string_lossy().to_string())
        .collect::<Vec<String>>()
        .join(separator)
}

pub(crate) fn resolve_resource(app: &tauri::AppHandle, relative: &str) -> Option<PathBuf> {
    if let Ok(dir) = app.path().resource_dir() {
        let candidate: PathBuf = dir.join(relative);
        if candidate.exists() {
            return Some(fs::canonicalize(&candidate).unwrap_or(candidate));
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let candidate = exe_dir.join("_up_").join("resources").join(relative);
            if candidate.exists() {
                return Some(fs::canonicalize(&candidate).unwrap_or(candidate));
            }
        }
    }

    let fallback = PathBuf::from("resources").join(relative);
    if fallback.exists() {
        return Some(fs::canonicalize(&fallback).unwrap_or(fallback));
    }

    let dev_fallback = PathBuf::from("..").join("resources").join(relative);
    if dev_fallback.exists() {
        return Some(fs::canonicalize(&dev_fallback).unwrap_or(dev_fallback));
    }

    None
}

pub(crate) fn resolve_src_root(root: &Path, src_root: &str) -> PathBuf {
    if src_root.trim().is_empty() {
        return root.join("src");
    }
    let candidate = PathBuf::from(src_root);
    if candidate.is_absolute() {
        return candidate;
    }
    root.join(candidate)
}

pub(crate) fn resolve_project_src_root(root: &Path, src_root: &str) -> PathBuf {
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

pub(crate) fn collect_java_files(path: &Path, acc: &mut Vec<PathBuf>) -> io::Result<()> {
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

pub(crate) fn resource_candidates(app: &tauri::AppHandle, relative: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(dir) = app.path().resource_dir() {
        candidates.push(dir.join(relative));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            candidates.push(exe_dir.join("_up_").join("resources").join(relative));
        }
    }
    candidates.push(PathBuf::from("resources").join(relative));
    candidates.push(PathBuf::from("..").join("resources").join(relative));
    candidates
}
