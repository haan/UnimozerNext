use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const JDTLS_DIR: &str = "jdtls";

fn config_dir_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "config_win"
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "config_mac_arm"
        } else {
            "config_mac"
        }
    } else if cfg!(target_arch = "aarch64") {
        "config_linux_arm"
    } else {
        "config_linux"
    }
}

fn sanitize_name(value: &str) -> String {
    value
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
        .collect()
}

fn hash_path(path: &Path) -> String {
    let mut hasher = DefaultHasher::new();
    path.to_string_lossy().hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

fn copy_dir_all(src: &Path, dest: &Path) -> Result<(), String> {
    if !src.is_dir() {
        return Err(format!("JDT LS config dir not found: {}", src.display()));
    }
    fs::create_dir_all(dest).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(src).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let target = dest.join(entry.file_name());
        if path.is_dir() {
            copy_dir_all(&path, &target)?;
        } else {
            fs::copy(&path, &target).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

pub fn resolve_resource(app: &AppHandle, relative: &str) -> Option<PathBuf> {
    if let Ok(dir) = app.path().resource_dir() {
        let candidate = dir.join(relative);
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

fn jdtls_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = resolve_resource(app, JDTLS_DIR).ok_or_else(|| "JDT LS not found".to_string())?;
    if !root.is_dir() {
        return Err("JDT LS directory missing".to_string());
    }
    Ok(root)
}

fn find_launcher_jar(plugins_dir: &Path) -> Result<PathBuf, String> {
    let mut matches: Vec<PathBuf> = Vec::new();
    let entries = fs::read_dir(plugins_dir).map_err(|error| error.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if let Some(name) = path.file_name().and_then(|item| item.to_str()) {
            if name.starts_with("org.eclipse.equinox.launcher_") && name.ends_with(".jar") {
                matches.push(path);
            }
        }
    }
    matches.sort();
    matches
        .last()
        .cloned()
        .ok_or_else(|| "Equinox launcher jar not found".to_string())
}

pub fn ensure_writable_config(app: &AppHandle, build_id: &str) -> Result<PathBuf, String> {
    let root = jdtls_root(app)?;
    let config_name = config_dir_name();
    let source = root.join(config_name);
    let config_root = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("jdtls-config")
        .join(sanitize_name(build_id))
        .join(config_name);
    if !config_root.exists() {
        copy_dir_all(&source, &config_root)?;
    }
    Ok(config_root)
}

pub fn workspace_dir(app: &AppHandle, project_root: &Path) -> Result<PathBuf, String> {
    let hash = hash_path(project_root);
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("jdtls-workspaces")
        .join(hash);
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path)
}

pub fn log_path(app: &AppHandle, project_root: &Path) -> Result<PathBuf, String> {
    let hash = hash_path(project_root);
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("logs")
        .join("jdtls");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join(format!("{}.log", hash)))
}

pub fn spawn_jdtls(
    app: &AppHandle,
    java_path: &Path,
    project_root: &Path,
) -> Result<(Child, PathBuf), String> {
    let root = jdtls_root(app)?;
    let plugins_dir = root.join("plugins");
    let launcher_jar = find_launcher_jar(&plugins_dir)?;
    let build_id = launcher_jar
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("jdtls");

    let config_dir = ensure_writable_config(app, build_id)?;
    let workspace = workspace_dir(app, project_root)?;
    let log_file = log_path(app, project_root)?;

    let mut command = Command::new(java_path);
    command
        .arg("-Declipse.application=org.eclipse.jdt.ls.core.id1")
        .arg("-Dosgi.bundles.defaultStartLevel=4")
        .arg("-Declipse.product=org.eclipse.jdt.ls.core.product")
        .arg("-Dlog.level=ALL")
        .arg(format!("-Dorg.eclipse.jdt.ls.log.file={}", log_file.display()))
        .arg("-Xmx1G")
        .arg("--add-modules=ALL-SYSTEM")
        .arg("--add-opens")
        .arg("java.base/java.util=ALL-UNNAMED")
        .arg("--add-opens")
        .arg("java.base/java.lang=ALL-UNNAMED")
        .arg("-jar")
        .arg(launcher_jar)
        .arg("-configuration")
        .arg(config_dir)
        .arg("-data")
        .arg(workspace)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let child = command.spawn().map_err(|error| error.to_string())?;
    Ok((child, log_file))
}
