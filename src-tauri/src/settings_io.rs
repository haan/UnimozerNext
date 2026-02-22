use std::{fs, path::PathBuf};

use tauri::{AppHandle, Manager};

use crate::app_settings::AppSettings;
use crate::command_error::{to_command_error, CommandResult};

fn system_prefers_dark_mode(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|window| window.theme().ok())
        .map(|theme| matches!(theme, tauri::Theme::Dark))
        .unwrap_or(false)
}

fn os_default_settings(app: &AppHandle) -> AppSettings {
    AppSettings::default_with_dark_mode(system_prefers_dark_mode(app))
}

#[tauri::command]
pub fn read_settings(app: AppHandle) -> CommandResult<AppSettings> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(os_default_settings(&app));
    }
    let contents = fs::read_to_string(&path).map_err(to_command_error)?;
    let parsed =
        serde_json::from_str::<AppSettings>(&contents).unwrap_or_else(|_| os_default_settings(&app));
    Ok(parsed)
}

#[tauri::command]
pub fn read_default_settings(app: AppHandle) -> CommandResult<AppSettings> {
    Ok(os_default_settings(&app))
}

#[tauri::command]
pub fn write_settings(app: AppHandle, settings: AppSettings) -> CommandResult<()> {
    let path = settings_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(to_command_error)?;
    }
    let payload = serde_json::to_string_pretty(&settings).map_err(to_command_error)?;
    fs::write(path, payload).map_err(to_command_error)
}

pub fn settings_path(app: &AppHandle) -> CommandResult<PathBuf> {
    let config_dir = app.path().app_config_dir().map_err(to_command_error)?;
    Ok(config_dir.join("settings.json"))
}

pub fn load_startup_settings(app: &AppHandle) -> AppSettings {
    let Ok(path) = settings_path(app) else {
        return os_default_settings(app);
    };
    if !path.exists() {
        return os_default_settings(app);
    }
    let Ok(contents) = fs::read_to_string(&path) else {
        return os_default_settings(app);
    };
    serde_json::from_str::<AppSettings>(&contents).unwrap_or_else(|_| os_default_settings(app))
}
