use tauri::{AppHandle, Manager};

use crate::compile_run::{shutdown_run_process, RunState};
use crate::jshell_io::{shutdown_jshell, JshellState};
use crate::ls;
use crate::parser_io::{shutdown_parser_bridge, ParserBridgeState};

pub(crate) fn shutdown_background_processes(app: &AppHandle) {
    let run_state = app.state::<RunState>();
    shutdown_run_process(&run_state);

    let jshell_state = app.state::<JshellState>();
    shutdown_jshell(&jshell_state);

    let parser_state = app.state::<ParserBridgeState>();
    shutdown_parser_bridge(&parser_state);

    let ls_state = app.state::<ls::LsState>();
    let _ = ls::shutdown(&ls_state);
}
