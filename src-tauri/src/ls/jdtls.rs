use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::{AppHandle, Manager};
use walkdir::WalkDir;

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

fn prepare_config(source: &Path, cache_root: &Path) -> Result<PathBuf, String> {
    if !source.join("config.ini").is_file() {
        return Err(format!("JDT LS config.ini not found: {}", source.display()));
    }

    // Hash the bundled files, not the writable copy (which Equinox modifies).
    // A launcher version can be shared by different JDT LS distributions.
    let mut files = Vec::new();
    for entry in WalkDir::new(source).min_depth(1) {
        let entry = entry.map_err(crate::command_error::to_command_error)?;
        if entry.file_type().is_file() {
            let relative = entry
                .path()
                .strip_prefix(source)
                .map_err(crate::command_error::to_command_error)?
                .to_path_buf();
            let contents =
                fs::read(entry.path()).map_err(crate::command_error::to_command_error)?;
            files.push((relative, contents));
        }
    }
    files.sort_by(|a, b| a.0.cmp(&b.0));
    let mut hasher = DefaultHasher::new();
    files.hash(&mut hasher);
    let destination = cache_root.join(format!("config-{:016x}", hasher.finish()));
    // Keep sibling state (e.g. @config.dir/../p2) isolated per snapshot too.
    let configuration = destination.join("configuration");
    if destination.is_dir() {
        return Ok(configuration);
    }

    // Publish only complete copies. Separate staging folders also allow two
    // app processes to prepare the same configuration without partial reads.
    fs::create_dir_all(cache_root).map_err(crate::command_error::to_command_error)?;
    static NEXT_STAGING_ID: AtomicU64 = AtomicU64::new(0);
    let staging = loop {
        let id = NEXT_STAGING_ID.fetch_add(1, Ordering::Relaxed);
        let candidate = cache_root.join(format!(".staging-{}-{id}", std::process::id()));
        match fs::create_dir(&candidate) {
            Ok(()) => break candidate,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(crate::command_error::to_command_error(error)),
        }
    };
    let result = (|| {
        for (relative, contents) in files {
            let target = staging.join("configuration").join(relative);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(crate::command_error::to_command_error)?;
            }
            fs::write(target, contents).map_err(crate::command_error::to_command_error)?;
        }
        match fs::rename(&staging, &destination) {
            Ok(()) => Ok(configuration.clone()),
            // Another process may have published the same complete snapshot.
            Err(_) if destination.is_dir() => Ok(configuration.clone()),
            Err(error) => Err(crate::command_error::to_command_error(error)),
        }
    })();
    if staging.exists() {
        let _ = fs::remove_dir_all(&staging);
    }
    result
}

pub fn resolve_resource(app: &AppHandle, relative: &str) -> Option<PathBuf> {
    if let Ok(dir) = app.path().resource_dir() {
        let candidate = dir.join(relative);
        if candidate.exists() {
            return Some(candidate);
        }
    }
    // AppImage runtime: Java assets are placed under usr/share via bundle.linux.appimage.files
    #[cfg(target_os = "linux")]
    if let Ok(appdir) = std::env::var("APPDIR") {
        let candidate = PathBuf::from(&appdir)
            .join("usr/share/unimozer-next/resources")
            .join(relative);
        if candidate.exists() {
            return Some(candidate);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let candidate = exe_dir.join("_up_").join("resources").join(relative);
            if candidate.exists() {
                return Some(candidate);
            }
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
    let entries = fs::read_dir(plugins_dir).map_err(crate::command_error::to_command_error)?;
    for entry in entries {
        let entry = entry.map_err(crate::command_error::to_command_error)?;
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
        .map_err(crate::command_error::to_command_error)?
        .join("jdtls-config")
        .join(sanitize_name(build_id))
        .join(config_name);
    prepare_config(&source, &config_root)
}

pub fn workspace_dir(app: &AppHandle, project_root: &Path) -> Result<PathBuf, String> {
    let hash = hash_path(project_root);
    let path = app
        .path()
        .app_data_dir()
        .map_err(crate::command_error::to_command_error)?
        .join("jdtls-workspaces")
        .join(hash);
    fs::create_dir_all(&path).map_err(crate::command_error::to_command_error)?;
    Ok(path)
}

pub fn log_path(app: &AppHandle, project_root: &Path) -> Result<PathBuf, String> {
    let hash = hash_path(project_root);
    let dir = app
        .path()
        .app_data_dir()
        .map_err(crate::command_error::to_command_error)?
        .join("logs")
        .join("jdtls");
    fs::create_dir_all(&dir).map_err(crate::command_error::to_command_error)?;
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
        .arg(format!(
            "-Dorg.eclipse.jdt.ls.log.file={}",
            log_file.display()
        ))
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

    let child = command
        .spawn()
        .map_err(crate::command_error::to_command_error)?;
    Ok((child, log_file))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(label: &str) -> Self {
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "unimozer-jdtls-{label}-{}-{timestamp}",
                std::process::id()
            ));
            fs::create_dir_all(path.join("bundled")).unwrap();
            Self(path)
        }

        fn source(&self) -> PathBuf {
            self.0.join("bundled")
        }

        fn cache(&self) -> PathBuf {
            self.0.join("same-launcher/config_win")
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn config_upgrade_bypasses_legacy_cache_and_preserves_working_state() {
        let dir = TestDirectory::new("upgrade");
        fs::create_dir_all(dir.cache()).unwrap();
        fs::write(dir.cache().join("config.ini"), "legacy configuration").unwrap();
        fs::write(dir.source().join("config.ini"), "bundles=old").unwrap();
        let old = prepare_config(&dir.source(), &dir.cache()).unwrap();
        assert_ne!(old, dir.cache());
        fs::write(old.join("runtime-cache"), "keep").unwrap();
        fs::write(old.join("config.ini"), "runtime modified configuration").unwrap();
        assert_eq!(prepare_config(&dir.source(), &dir.cache()).unwrap(), old);

        fs::write(dir.source().join("config.ini"), "bundles=new").unwrap();
        let new = prepare_config(&dir.source(), &dir.cache()).unwrap();
        assert_ne!(new, old);
        assert_eq!(
            fs::read_to_string(new.join("config.ini")).unwrap(),
            "bundles=new"
        );
        assert!(!new.join("runtime-cache").exists());
        assert_eq!(
            fs::read_to_string(old.join("runtime-cache")).unwrap(),
            "keep"
        );
        assert_eq!(
            fs::read_to_string(dir.cache().join("config.ini")).unwrap(),
            "legacy configuration"
        );
    }

    #[test]
    fn config_snapshot_includes_nested_file_contents_and_names() {
        let dir = TestDirectory::new("nested");
        fs::write(dir.source().join("config.ini"), "unchanged").unwrap();
        fs::create_dir_all(dir.source().join("settings")).unwrap();
        let settings = dir.source().join("settings/bundles.info");
        fs::write(&settings, "old").unwrap();
        let first = prepare_config(&dir.source(), &dir.cache()).unwrap();
        fs::write(&settings, "new").unwrap();
        let changed = prepare_config(&dir.source(), &dir.cache()).unwrap();
        assert_ne!(first, changed);
        assert_eq!(
            fs::read_to_string(changed.join("settings/bundles.info")).unwrap(),
            "new"
        );
        fs::rename(&settings, dir.source().join("settings/renamed.info")).unwrap();
        let renamed = prepare_config(&dir.source(), &dir.cache()).unwrap();
        assert_ne!(changed, renamed);
        assert!(!renamed.join("settings/bundles.info").exists());
        fs::remove_file(dir.source().join("settings/renamed.info")).unwrap();
        let removed = prepare_config(&dir.source(), &dir.cache()).unwrap();
        assert_ne!(renamed, removed);
        assert!(!removed.join("settings/renamed.info").exists());
    }

    #[test]
    fn concurrent_preparation_publishes_complete_config_and_ignores_abandoned_staging() {
        let dir = TestDirectory::new("concurrent");
        fs::write(dir.source().join("config.ini"), "bundles=new").unwrap();
        fs::create_dir_all(dir.cache().join(".staging-abandoned")).unwrap();
        let barrier = std::sync::Barrier::new(4);
        let paths = std::thread::scope(|scope| {
            let handles: Vec<_> = (0..4)
                .map(|_| {
                    scope.spawn(|| {
                        barrier.wait();
                        let path = prepare_config(&dir.source(), &dir.cache()).unwrap();
                        assert_eq!(
                            fs::read_to_string(path.join("config.ini")).unwrap(),
                            "bundles=new"
                        );
                        path
                    })
                })
                .collect();
            handles
                .into_iter()
                .map(|handle| handle.join().unwrap())
                .collect::<Vec<_>>()
        });
        assert!(paths.iter().all(|path| path == &paths[0]));
        assert_eq!(fs::read_dir(dir.cache()).unwrap().count(), 2);
    }

    #[test]
    fn missing_bundled_config_does_not_fall_back_to_stale_cache() {
        let dir = TestDirectory::new("missing");
        fs::write(dir.source().join("config.ini"), "bundles=old").unwrap();
        let old = prepare_config(&dir.source(), &dir.cache()).unwrap();
        fs::remove_file(dir.source().join("config.ini")).unwrap();
        assert!(prepare_config(&dir.source(), &dir.cache()).is_err());
        assert!(old.join("config.ini").is_file());
    }
}
