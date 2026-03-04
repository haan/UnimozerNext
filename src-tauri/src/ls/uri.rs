use std::path::{Path, PathBuf};
use url::Url;
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

pub fn path_to_uri(path: &Path) -> String {
    let normalized = simplify_fs_path(path);
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
        let uri = path_to_uri(Path::new(r"Z:\NetBeansProjects\mikado\src\Main.java"));
        assert_eq!(uri, "file:///Z:/NetBeansProjects/mikado/src/Main.java");
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
}
