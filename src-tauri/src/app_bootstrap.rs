#[cfg(any(target_os = "macos", target_os = "ios"))]
use crate::launch_io::parse_launch_umz_arg;
use crate::launch_io::{collect_startup_umz_paths, queue_launch_open_paths};
use crate::lifecycle::shutdown_background_processes;
use crate::project_archive::cleanup_stale_workspace_sessions_async;
use crate::settings_io::load_startup_settings;
use crate::startup_diagnostics::log_startup_diagnostics;

pub(crate) fn setup_startup(app: &tauri::AppHandle) {
    let settings = load_startup_settings(app);
    let launch_paths = collect_startup_umz_paths();
    queue_launch_open_paths(app, launch_paths);
    cleanup_stale_workspace_sessions_async(app.clone());
    if settings.debug_logging_enabled() {
        log_startup_diagnostics(app);
    }
}

pub(crate) fn handle_run_event(
    app: &tauri::AppHandle,
    event: &tauri::RunEvent,
    cleaned_up: &mut bool,
) {
    if !*cleaned_up
        && matches!(
            event,
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
        )
    {
        shutdown_background_processes(app);
        *cleaned_up = true;
    }

    #[cfg(any(target_os = "macos", target_os = "ios"))]
    if let tauri::RunEvent::Opened { urls } = event {
        let paths = urls
            .iter()
            .filter_map(|url| parse_launch_umz_arg(url.as_str()))
            .collect::<Vec<String>>();
        queue_launch_open_paths(app, paths);
    }

    #[cfg(not(any(target_os = "macos", target_os = "ios")))]
    let _ = (app, event);
}
