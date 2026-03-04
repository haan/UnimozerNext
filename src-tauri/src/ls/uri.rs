use std::path::{Path, PathBuf};
use url::Url;
#[cfg(target_os = "windows")]
use {
    std::ffi::OsStr,
    std::os::windows::ffi::OsStrExt,
    windows_sys::Win32::Foundation::{ERROR_MORE_DATA, NO_ERROR},
    windows_sys::Win32::NetworkManagement::WNet::WNetGetConnectionW,
};
#[cfg(target_os = "windows")]
fn simplify_fs_path(path: &Path) -> PathBuf {
    let simplified = dunce::simplified(path).to_path_buf();
    let Some(text) = simplified.to_str() else {
        return simplified;
    };
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{}", rest));
    }
    if let Some(rest) = text.strip_prefix(r"\\?\") {
        return PathBuf::from(rest);
    }
    simplified
}

#[cfg(not(target_os = "windows"))]
fn simplify_fs_path(path: &Path) -> PathBuf {
    dunce::simplified(path).to_path_buf()
}

#[cfg(target_os = "windows")]
fn expand_mapped_drive_to_unc(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    let mut chars = text.chars();
    let Some(drive_letter) = chars.next() else {
        return path.to_path_buf();
    };
    let Some(colon) = chars.next() else {
        return path.to_path_buf();
    };
    let Some(separator) = chars.next() else {
        return path.to_path_buf();
    };
    if !drive_letter.is_ascii_alphabetic() || colon != ':' || (separator != '\\' && separator != '/')
    {
        return path.to_path_buf();
    }

    let drive = format!("{}:", drive_letter.to_ascii_uppercase());
    let local_name: Vec<u16> = OsStr::new(&drive).encode_wide().chain(std::iter::once(0)).collect();
    let mut required_len = 0u32;
    let first_status = unsafe {
        WNetGetConnectionW(local_name.as_ptr(), std::ptr::null_mut(), &mut required_len)
    };
    if first_status != ERROR_MORE_DATA && first_status != NO_ERROR {
        return path.to_path_buf();
    }
    if required_len == 0 {
        return path.to_path_buf();
    }

    let mut remote_buffer = vec![0u16; required_len as usize];
    let second_status = unsafe {
        WNetGetConnectionW(local_name.as_ptr(), remote_buffer.as_mut_ptr(), &mut required_len)
    };
    if second_status != NO_ERROR {
        return path.to_path_buf();
    }
    let remote_len = remote_buffer
        .iter()
        .position(|ch| *ch == 0)
        .unwrap_or(remote_buffer.len());
    if remote_len == 0 {
        return path.to_path_buf();
    }

    let remote_share = String::from_utf16_lossy(&remote_buffer[..remote_len]);
    if remote_share.is_empty() {
        return path.to_path_buf();
    }
    let suffix = text.get(2..).unwrap_or_default();
    PathBuf::from(format!("{remote_share}{suffix}"))
}

#[cfg(not(target_os = "windows"))]
fn expand_mapped_drive_to_unc(path: &Path) -> PathBuf {
    path.to_path_buf()
}

pub fn path_to_uri(path: &Path) -> String {
    let normalized = expand_mapped_drive_to_unc(&simplify_fs_path(path));
    if let Ok(url) = Url::from_file_path(&normalized) {
        return url.into();
    }

    let absolute = if normalized.is_absolute() {
        normalized.clone()
    } else if let Ok(cwd) = std::env::current_dir() {
        cwd.join(&normalized)
    } else {
        normalized.clone()
    };
    if let Ok(url) = Url::from_file_path(&absolute) {
        return url.into();
    }

    let fallback = normalized.to_string_lossy().replace('\\', "/");
    if fallback.starts_with('/') {
        format!("file://{fallback}")
    } else {
        format!("file:///{fallback}")
    }
}

pub fn uri_to_path(uri: &str) -> PathBuf {
    let Ok(parsed) = Url::parse(uri) else {
        return PathBuf::from(uri);
    };
    if parsed.scheme() != "file" {
        return PathBuf::from(uri);
    }

    match parsed.to_file_path() {
        Ok(path) => simplify_fs_path(&path),
        Err(()) => PathBuf::from(uri),
    }
}

#[cfg(test)]
mod tests {
    use super::{path_to_uri, uri_to_path};
    use std::path::Path;

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_drive_path_to_uri() {
        let uri = path_to_uri(Path::new(r"C:\NetBeansProjects\mikado\src\Main.java"));
        assert_eq!(uri, "file:///C:/NetBeansProjects/mikado/src/Main.java");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_unc_path_to_uri() {
        let uri = path_to_uri(Path::new(
            r"\\ltesch.local\users$\home\teachers\INFOTEACH\HAAN_LAURENT\NetBeansProjects\mikado",
        ));
        assert_eq!(
            uri,
            "file://ltesch.local/users$/home/teachers/INFOTEACH/HAAN_LAURENT/NetBeansProjects/mikado"
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_extended_drive_path_to_uri() {
        let uri = path_to_uri(Path::new(
            r"\\?\C:\NetBeansProjects\mikado\src\Main.java",
        ));
        assert_eq!(uri, "file:///C:/NetBeansProjects/mikado/src/Main.java");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_extended_unc_path_to_uri() {
        let uri = path_to_uri(Path::new(
            r"\\?\UNC\ltesch.local\users$\home\teachers\INFOTEACH\HAAN_LAURENT\NetBeansProjects\mikado",
        ));
        assert_eq!(
            uri,
            "file://ltesch.local/users$/home/teachers/INFOTEACH/HAAN_LAURENT/NetBeansProjects/mikado"
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_uri_to_path_drive() {
        let path = uri_to_path("file:///Z:/NetBeansProjects/mikado/src/Main.java");
        assert_eq!(
            path.to_string_lossy(),
            r"Z:\NetBeansProjects\mikado\src\Main.java"
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_uri_to_path_unc() {
        let path = uri_to_path(
            "file://ltesch.local/users$/home/teachers/INFOTEACH/HAAN_LAURENT/NetBeansProjects/mikado",
        );
        assert_eq!(
            path.to_string_lossy(),
            r"\\ltesch.local\users$\home\teachers\INFOTEACH\HAAN_LAURENT\NetBeansProjects\mikado"
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_uri_to_path_localhost_drive() {
        let path = uri_to_path("file://localhost/Z:/NetBeansProjects/mikado/src/Main.java");
        assert_eq!(
            path.to_string_lossy(),
            r"Z:\NetBeansProjects\mikado\src\Main.java"
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_uri_to_path_decodes_percent_escaped_segments() {
        let path = uri_to_path("file:///C:/Program%20Files/Unimozer%20Next/src/Main.java");
        assert_eq!(
            path.to_string_lossy(),
            r"C:\Program Files\Unimozer Next\src\Main.java"
        );
    }
}
