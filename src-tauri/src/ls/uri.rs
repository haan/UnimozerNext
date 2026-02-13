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

pub fn path_to_uri(path: &Path) -> String {
    let mut path_str = path.to_string_lossy().replace('\\', "/");
    if path_str.len() >= 2 && path_str.as_bytes()[1] == b':' {
        path_str = format!("/{}", path_str);
    }
    if path_str.starts_with("//") {
        path_str = format!("/{}", path_str);
    }
    format!("file://{}", percent_encode(&path_str))
}

pub fn uri_to_path(uri: &str) -> PathBuf {
    let stripped = uri.trim_start_matches("file://");
    let decoded = percent_decode(stripped);
    let normalized =
        if decoded.starts_with('/') && decoded.len() > 3 && decoded.as_bytes()[2] == b':' {
            decoded.trim_start_matches('/').to_string()
        } else {
            decoded
        };
    PathBuf::from(normalized)
}
