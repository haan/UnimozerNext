use std::process::Command;

use crate::command_error::{to_command_error, CommandResult};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
use crate::CREATE_NO_WINDOW;

fn is_allowed_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.starts_with("https://") || lower.starts_with("http://") || lower.starts_with("mailto:")
}

#[tauri::command]
pub fn open_url(url: String) -> CommandResult<()> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("URL cannot be empty".to_string());
    }
    if !is_allowed_url(trimmed) {
        return Err("Only http, https, and mailto links are allowed".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("rundll32");
        command
            .args(["url.dll,FileProtocolHandler", trimmed])
            .creation_flags(CREATE_NO_WINDOW);
        command.spawn().map_err(to_command_error)?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(trimmed)
            .spawn()
            .map_err(to_command_error)?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(trimmed)
            .spawn()
            .map_err(to_command_error)?;
        Ok(())
    }
}
