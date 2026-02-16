#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app_bootstrap;
mod app_settings;
mod command_error;
mod command_registry;
mod compile_run;
mod external_links;
mod fs_io;
mod java_tools;
mod jshell_io;
mod launch_io;
mod lifecycle;
mod ls;
mod parser_io;
mod project_archive;
mod project_io;
mod settings_io;
mod shared_types;
mod startup_diagnostics;
mod updater_io;
mod workspace_session;

use app_bootstrap::{handle_run_event, setup_startup};
use command_registry::with_invoke_handlers;
use compile_run::RunState;
use jshell_io::JshellState;
use launch_io::{LaunchOpenState, StartupLogState};
use parser_io::ParserBridgeState;
use workspace_session::WorkspaceSessionState;

#[cfg(target_os = "windows")]
pub(crate) const CREATE_NO_WINDOW: u32 = 0x08000000;

// Maximum number of stderr lines we keep per long-lived Java bridge process.
pub(crate) const BRIDGE_STDERR_BUFFER_MAX_LINES: usize = 50;

// Polling interval while waiting for a launched Java process to complete.
pub(crate) const RUN_POLL_INTERVAL_MS: u64 = 200;

// Stream chunk size when forwarding process output lines to the frontend.
pub(crate) const RUN_OUTPUT_CHUNK_SIZE_BYTES: usize = 8 * 1024;

// Safety cap to avoid unbounded frontend event traffic from runaway output.
pub(crate) const RUN_OUTPUT_MAX_EMIT_BYTES: usize = 2 * 1024 * 1024;

fn main() {
    let builder = tauri::Builder::default()
        .manage(StartupLogState::default())
        .manage(LaunchOpenState::default())
        .setup(|app| {
            setup_startup(app.handle());
            Ok(())
        })
        .manage(RunState::new())
        .manage(ParserBridgeState::default())
        .manage(JshellState::default())
        .manage(WorkspaceSessionState::new())
        .manage(ls::LsState::default())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build());
    let app = with_invoke_handlers(builder)
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    let mut cleaned_up = false;
    app.run(move |app, event| {
        handle_run_event(app, &event, &mut cleaned_up);
    });
}
