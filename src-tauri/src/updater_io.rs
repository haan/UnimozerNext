use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

use crate::command_error::{to_command_error, CommandResult};
use crate::lifecycle::shutdown_background_processes;

const STABLE_ENDPOINT_TEMPLATE: &str =
    "https://github.com/haan/UnimozerNext/releases/latest/download/latest-{target}.json";
const PRERELEASE_ENDPOINT_TEMPLATE: &str = "https://github.com/haan/UnimozerNext/releases/download/updater-prerelease/latest-{target}.json";
#[cfg(target_os = "windows")]
const MSI_UPDATER_DISABLED_MESSAGE: &str =
    "Self-update is disabled for MSI installations. Use the NSIS installer to enable in-app updates.";
#[cfg(target_os = "windows")]
const UNKNOWN_INSTALLER_UPDATER_DISABLED_MESSAGE: &str =
    "Self-update is disabled because the installer type could not be detected.";

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum UpdateChannel {
    Stable,
    Prerelease,
}

impl UpdateChannel {
    fn as_str(self) -> &'static str {
        match self {
            Self::Stable => "stable",
            Self::Prerelease => "prerelease",
        }
    }

    fn endpoint_for_target(self, target: &str) -> String {
        let template = match self {
            Self::Stable => STABLE_ENDPOINT_TEMPLATE,
            Self::Prerelease => PRERELEASE_ENDPOINT_TEMPLATE,
        };
        template.replace("{target}", target)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInstallability {
    installable: bool,
    reason: Option<String>,
    install_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSummary {
    current_version: String,
    version: String,
    notes: Option<String>,
    pub_date: Option<String>,
    target: String,
    download_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    channel: String,
    target: String,
    update: Option<UpdateSummary>,
    installability: UpdateInstallability,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInstallResult {
    installed: bool,
    version: Option<String>,
    message: Option<String>,
}

#[tauri::command]
pub fn detect_windows_installer_kind() -> CommandResult<String> {
    Ok(detect_windows_installer_kind_value())
}

#[tauri::command]
pub fn updater_installability() -> CommandResult<UpdateInstallability> {
    compute_installability()
}

#[tauri::command]
pub async fn updater_check(
    app: AppHandle,
    channel: UpdateChannel,
) -> CommandResult<UpdateCheckResult> {
    let installability = compute_installability()?;
    let target = resolve_updater_target()?;
    if !installability.installable {
        return Ok(UpdateCheckResult {
            channel: channel.as_str().to_string(),
            target,
            update: None,
            installability,
        });
    }

    let endpoint = channel.endpoint_for_target(&target);

    let endpoint_url = endpoint.parse().map_err(to_command_error)?;
    let updater_builder = app
        .updater_builder()
        .target(target.clone())
        .endpoints(vec![endpoint_url])
        .map_err(to_command_error)?;
    let updater = updater_builder.build().map_err(to_command_error)?;
    let update = updater.check().await.map_err(to_command_error)?;

    let summary = update.map(|item| UpdateSummary {
        current_version: item.current_version.to_string(),
        version: item.version.to_string(),
        notes: item.body.clone(),
        pub_date: item.date.map(|date| date.to_string()),
        target: item.target.clone(),
        download_url: item.download_url.to_string(),
    });

    Ok(UpdateCheckResult {
        channel: channel.as_str().to_string(),
        target,
        update: summary,
        installability,
    })
}

#[tauri::command]
pub async fn updater_install(
    app: AppHandle,
    channel: UpdateChannel,
) -> CommandResult<UpdateInstallResult> {
    let installability = compute_installability()?;
    if !installability.installable {
        return Ok(UpdateInstallResult {
            installed: false,
            version: None,
            message: installability.reason,
        });
    }

    let target = resolve_updater_target()?;
    let endpoint = channel.endpoint_for_target(&target);
    let endpoint_url = endpoint.parse().map_err(to_command_error)?;
    let updater_builder = app
        .updater_builder()
        .target(target.clone())
        .endpoints(vec![endpoint_url])
        .map_err(to_command_error)?;
    let updater = updater_builder.build().map_err(to_command_error)?;
    let update = updater.check().await.map_err(to_command_error)?;
    let Some(update) = update else {
        return Ok(UpdateInstallResult {
            installed: false,
            version: None,
            message: Some("No update is available.".to_string()),
        });
    };

    let version = update.version.to_string();
    // Ensure no background Java/LSP processes keep files in the install
    // directory locked while the updater installer runs.
    shutdown_background_processes(&app);
    std::thread::sleep(std::time::Duration::from_millis(300));

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(to_command_error)?;

    Ok(UpdateInstallResult {
        installed: true,
        version: Some(version),
        message: Some("Update downloaded. Unimozer Next will now close to apply it.".to_string()),
    })
}

fn resolve_updater_target() -> CommandResult<String> {
    let arch = normalize_arch(std::env::consts::ARCH);
    let target = match std::env::consts::OS {
        "windows" => format!("windows-{arch}-{}", detect_windows_installer_kind_value()),
        "macos" => format!("darwin-{arch}"),
        "linux" => format!("linux-{arch}"),
        other => format!("{other}-{arch}"),
    };
    Ok(target)
}

fn normalize_arch(arch: &str) -> &str {
    match arch {
        "x86_64" => "x86_64",
        "aarch64" => "aarch64",
        "arm" => "armv7",
        other => other,
    }
}

fn compute_installability() -> CommandResult<UpdateInstallability> {
    let install_root = resolve_install_root()?;
    let install_path = install_root.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        match detect_windows_installer_kind_value().as_str() {
            "nsis" => {}
            "msi" => {
                return Ok(UpdateInstallability {
                    installable: false,
                    reason: Some(MSI_UPDATER_DISABLED_MESSAGE.to_string()),
                    install_path,
                })
            }
            _ => {
                return Ok(UpdateInstallability {
                    installable: false,
                    reason: Some(UNKNOWN_INSTALLER_UPDATER_DISABLED_MESSAGE.to_string()),
                    install_path,
                })
            }
        }
    }

    let probe_name = format!(
        ".unimozer-update-probe-{}-{}",
        std::process::id(),
        chrono_like_timestamp()
    );
    let probe_path = install_root.join(probe_name);

    let write_result = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe_path);
    match write_result {
        Ok(file) => {
            drop(file);
            let _ = fs::remove_file(&probe_path);
            Ok(UpdateInstallability {
                installable: true,
                reason: None,
                install_path,
            })
        }
        Err(error) => Ok(UpdateInstallability {
            installable: false,
            reason: Some(format!(
                "Installation directory is not writable for this user: {}",
                error
            )),
            install_path,
        }),
    }
}

fn resolve_install_root() -> CommandResult<PathBuf> {
    let exe = std::env::current_exe().map_err(to_command_error)?;
    #[cfg(target_os = "macos")]
    {
        if let Some(root) = resolve_macos_bundle_root(&exe) {
            return Ok(root);
        }
    }
    exe.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Failed to resolve installation directory.".to_string())
}

#[cfg(target_os = "macos")]
fn resolve_macos_bundle_root(exe_path: &Path) -> Option<PathBuf> {
    let macos_dir = exe_path.parent()?;
    if macos_dir.file_name()?.to_string_lossy() != "MacOS" {
        return None;
    }
    let contents_dir = macos_dir.parent()?;
    if contents_dir.file_name()?.to_string_lossy() != "Contents" {
        return None;
    }
    Some(contents_dir.parent()?.to_path_buf())
}

fn chrono_like_timestamp() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

#[cfg(target_os = "windows")]
fn detect_windows_installer_kind_value() -> String {
    let install_root = resolve_install_root().unwrap_or_else(|_| PathBuf::new());

    if let Some(marker_kind) = read_marker_installer_kind(&install_root) {
        return marker_kind;
    }
    if let Some(heuristic_kind) = read_uninstall_heuristic_kind(&install_root) {
        return heuristic_kind;
    }
    "unknown".to_string()
}

#[cfg(not(target_os = "windows"))]
fn detect_windows_installer_kind_value() -> String {
    "unknown".to_string()
}

#[cfg(target_os = "windows")]
fn read_marker_installer_kind(install_root: &Path) -> Option<String> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    const MARKER_KEY_PATH: &str = r"Software\com.unimozer.next\Installer";
    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let root = RegKey::predef(hive);
        let Ok(marker) = root.open_subkey_with_flags(MARKER_KEY_PATH, KEY_READ) else {
            continue;
        };
        let Ok(marker_install_path) = marker.get_value::<String, _>("InstallPath") else {
            continue;
        };
        if !paths_match(install_root, Path::new(&marker_install_path)) {
            continue;
        }
        let Ok(kind) = marker.get_value::<String, _>("InstallerKind") else {
            continue;
        };
        let normalized_kind = kind.trim().to_ascii_lowercase();
        if normalized_kind == "msi" || normalized_kind == "nsis" {
            return Some(normalized_kind);
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn read_uninstall_heuristic_kind(install_root: &Path) -> Option<String> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    const UNINSTALL_KEY_PATH: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall";
    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let root = RegKey::predef(hive);
        let Ok(uninstall_root) = root.open_subkey_with_flags(UNINSTALL_KEY_PATH, KEY_READ) else {
            continue;
        };
        for entry_key_name in uninstall_root.enum_keys().flatten() {
            let Ok(entry) = uninstall_root.open_subkey_with_flags(&entry_key_name, KEY_READ) else {
                continue;
            };
            if !uninstall_entry_matches_install_root(&entry, install_root) {
                continue;
            }
            if let Ok(windows_installer) = entry.get_value::<u32, _>("WindowsInstaller") {
                if windows_installer == 1 {
                    return Some("msi".to_string());
                }
            }
            return Some("nsis".to_string());
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn uninstall_entry_matches_install_root(entry: &winreg::RegKey, install_root: &Path) -> bool {
    if let Ok(install_location) = entry.get_value::<String, _>("InstallLocation") {
        if !install_location.trim().is_empty()
            && paths_match(install_root, Path::new(&install_location))
        {
            return true;
        }
    }

    if let Ok(display_icon) = entry.get_value::<String, _>("DisplayIcon") {
        let icon_path = display_icon
            .split(',')
            .next()
            .map(str::trim)
            .unwrap_or_default()
            .trim_matches('"');
        if !icon_path.is_empty() {
            if let Some(icon_dir) = Path::new(icon_path).parent() {
                if paths_match(install_root, icon_dir) {
                    return true;
                }
            }
        }
    }

    false
}

#[cfg(target_os = "windows")]
fn paths_match(left: &Path, right: &Path) -> bool {
    normalize_path_for_compare(left) == normalize_path_for_compare(right)
}

#[cfg(target_os = "windows")]
fn normalize_path_for_compare(path: &Path) -> String {
    let mut raw = path.to_string_lossy().replace('/', "\\");
    while raw.ends_with('\\') {
        raw.pop();
    }
    raw.to_ascii_lowercase()
}
