use tauri::Manager;

use crate::java_tools::{
    java_executable_name, javac_executable_name, jdk_relative_dir, jdtls_config_relative_dir,
    resolve_resource, resource_candidates,
};
use crate::launch_io::{append_startup_logs, collect_startup_umz_paths};
use crate::settings_io::settings_path;

pub(crate) fn log_startup_diagnostics(app: &tauri::AppHandle) {
    let mut lines: Vec<String> = Vec::new();
    let mut push = |text: String| {
        lines.push(text);
    };

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    push(format!(
        "[startup] Unimozer Next diagnostics (debug logging enabled)"
    ));
    push(format!("[startup] timestamp_unix: {}", now));
    push(format!(
        "[startup] version: {}",
        app.package_info().version.to_string()
    ));
    push(format!(
        "[startup] os: {} / arch: {}",
        std::env::consts::OS,
        std::env::consts::ARCH
    ));
    if let Ok(exe) = std::env::current_exe() {
        push(format!("[startup] exe: {}", exe.display()));
    }
    if let Ok(dir) = app.path().resource_dir() {
        push(format!("[startup] resource_dir: {}", dir.display()));
    }
    if let Ok(dir) = app.path().app_data_dir() {
        push(format!("[startup] app_data_dir: {}", dir.display()));
    }
    if let Ok(dir) = app.path().app_config_dir() {
        push(format!("[startup] app_config_dir: {}", dir.display()));
    }
    if let Ok(path) = settings_path(app) {
        push(format!("[startup] settings_path: {}", path.display()));
    }

    let raw_args = std::env::args_os()
        .skip(1)
        .map(|arg| arg.to_string_lossy().to_string())
        .collect::<Vec<String>>();
    push(format!("[startup] launch_args: {:?}", raw_args));
    let parsed_launch_paths = collect_startup_umz_paths();
    push(format!(
        "[startup] parsed_launch_umz_paths: {:?}",
        parsed_launch_paths
    ));

    let jdk_dir = jdk_relative_dir();
    let jdtls_config_dir = jdtls_config_relative_dir();
    push(format!("[startup] jdk_relative_dir: {}", jdk_dir));
    push(format!("[startup] jdtls_config_dir: {}", jdtls_config_dir));

    for relative in [
        jdk_dir,
        &java_executable_name(),
        &javac_executable_name(),
        "java-parser/parser-bridge.jar",
        "jshell-bridge/jshell-bridge.jar",
        "jdtls",
        "jdtls/plugins",
        jdtls_config_dir,
    ] {
        push(format!("[startup] resource candidates for: {}", relative));
        for candidate in resource_candidates(app, relative) {
            let status = if candidate.exists() { "ok" } else { "missing" };
            push(format!("  - {} [{}]", candidate.display(), status));
        }
        if let Some(resolved) = resolve_resource(app, relative) {
            push(format!("[startup] resolved: {}", resolved.display()));
        } else {
            push(format!("[startup] resolved: <none>"));
        }
    }

    for line in &lines {
        println!("{}", line);
    }
    append_startup_logs(app, &lines);
}
