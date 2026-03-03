use std::path::{Path, PathBuf};

fn is_unreserved(byte: u8) -> bool {
    (byte >= b'a' && byte <= b'z')
        || (byte >= b'A' && byte <= b'Z')
        || (byte >= b'0' && byte <= b'9')
        || byte == b'-'
        || byte == b'.'
        || byte == b'_'
        || byte == b'~'
}

fn percent_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.as_bytes() {
        if is_unreserved(*byte) || *byte == b'/' || *byte == b':' {
            out.push(*byte as char);
        } else {
            out.push_str(&format!("%{:02X}", byte));
        }
    }
    out
}

fn percent_decode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut bytes = input.as_bytes().iter().copied().peekable();
    while let Some(byte) = bytes.next() {
        if byte == b'%' {
            let hi = bytes.next().unwrap_or(b'0');
            let lo = bytes.next().unwrap_or(b'0');
            if let (Some(h), Some(l)) = (hex_value(hi), hex_value(lo)) {
                out.push((h * 16 + l) as char);
            } else {
                out.push('%');
                out.push(hi as char);
                out.push(lo as char);
            }
        } else {
            out.push(byte as char);
        }
    }
    out
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

#[cfg(target_os = "windows")]
fn normalize_windows_extended_path(path: &str) -> String {
    if let Some(rest) = path.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{}", rest);
    }
    if let Some(rest) = path.strip_prefix(r"\\?\") {
        return rest.to_string();
    }
    path.to_string()
}

pub fn path_to_uri(path: &Path) -> String {
    #[cfg(target_os = "windows")]
    {
        let raw = path.to_string_lossy().to_string();
        let mut normalized = normalize_windows_extended_path(&raw).replace('\\', "/");

        if normalized.len() >= 3
            && normalized.as_bytes()[1] == b':'
            && normalized.as_bytes()[2] == b'/'
        {
            normalized = format!("/{}", normalized);
            return format!("file://{}", percent_encode(&normalized));
        }

        if normalized.starts_with("//") {
            let without_prefix = normalized.trim_start_matches('/');
            let mut parts = without_prefix.splitn(2, '/');
            let authority = parts.next().unwrap_or_default();
            let path_part = format!("/{}", parts.next().unwrap_or_default());
            return format!("file://{}{}", authority, percent_encode(&path_part));
        }

        if normalized.starts_with('/') {
            return format!("file://{}", percent_encode(&normalized));
        }

        return format!("file://{}", percent_encode(&format!("/{}", normalized)));
    }

    #[cfg(not(target_os = "windows"))]
    {
        let path_str = path.to_string_lossy().replace('\\', "/");
        if path_str.starts_with('/') {
            format!("file://{}", percent_encode(&path_str))
        } else {
            format!("file://{}", percent_encode(&format!("/{}", path_str)))
        }
    }
}

pub fn uri_to_path(uri: &str) -> PathBuf {
    let prefix = "file://";
    let stripped = match uri.get(..prefix.len()) {
        Some(candidate) if candidate.eq_ignore_ascii_case(prefix) => &uri[prefix.len()..],
        _ => return PathBuf::from(uri),
    };
    let body = stripped
        .split('#')
        .next()
        .unwrap_or(stripped)
        .split('?')
        .next()
        .unwrap_or(stripped);

    #[cfg(target_os = "windows")]
    {
        if body.starts_with('/') {
            if body.starts_with("//") {
                let decoded = percent_decode(body.trim_start_matches('/'));
                return PathBuf::from(format!(r"\\{}", decoded.replace('/', "\\")));
            }

            let decoded = percent_decode(body);
            if decoded.len() >= 3
                && decoded.as_bytes()[0] == b'/'
                && decoded.as_bytes()[2] == b':'
            {
                return PathBuf::from(decoded.trim_start_matches('/').replace('/', "\\"));
            }
            return PathBuf::from(decoded.replace('/', "\\"));
        }

        let mut parts = body.splitn(2, '/');
        let authority = parts.next().unwrap_or_default();
        let path_part = parts.next().unwrap_or_default();

        if authority.is_empty() || authority.eq_ignore_ascii_case("localhost") {
            let prefixed = format!("/{}", path_part);
            let decoded = percent_decode(&prefixed);
            if decoded.len() >= 3
                && decoded.as_bytes()[0] == b'/'
                && decoded.as_bytes()[2] == b':'
            {
                return PathBuf::from(decoded.trim_start_matches('/').replace('/', "\\"));
            }
            return PathBuf::from(decoded.replace('/', "\\"));
        }

        let joined = if path_part.is_empty() {
            authority.to_string()
        } else {
            format!("{authority}/{path_part}")
        };
        let decoded = percent_decode(&joined);
        PathBuf::from(format!(r"\\{}", decoded.replace('/', "\\")))
    }

    #[cfg(not(target_os = "windows"))]
    {
        if body.starts_with('/') {
            return PathBuf::from(percent_decode(body));
        }

        let mut parts = body.splitn(2, '/');
        let authority = parts.next().unwrap_or_default();
        let path_part = parts.next().unwrap_or_default();
        if authority.is_empty() || authority.eq_ignore_ascii_case("localhost") {
            PathBuf::from(percent_decode(&format!("/{}", path_part)))
        } else {
            PathBuf::from(percent_decode(&format!("//{authority}/{path_part}")))
        }
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
            "file://ltesch.local/users%24/home/teachers/INFOTEACH/HAAN_LAURENT/NetBeansProjects/mikado"
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
