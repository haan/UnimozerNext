use serde_json::Value;
use std::io::{self, BufRead, Read, Write};

pub struct JsonRpcReader<R: Read> {
    reader: io::BufReader<R>,
}

impl<R: Read> JsonRpcReader<R> {
    pub fn new(inner: R) -> Self {
        Self {
            reader: io::BufReader::new(inner),
        }
    }

    pub fn read_message(&mut self) -> io::Result<Option<Value>> {
        let mut content_length: Option<usize> = None;
        loop {
            let mut line = String::new();
            let bytes = self.reader.read_line(&mut line)?;
            if bytes == 0 {
                return Ok(None);
            }
            let trimmed = line.trim_end_matches(&['\r', '\n'][..]);
            if trimmed.is_empty() {
                break;
            }
            if let Some(value) = trimmed.strip_prefix("Content-Length:") {
                content_length = value.trim().parse::<usize>().ok();
            }
        }

        let len = match content_length {
            Some(len) => len,
            None => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "Missing Content-Length",
                ))
            }
        };

        let mut buffer = vec![0u8; len];
        self.reader.read_exact(&mut buffer)?;
        let text = String::from_utf8_lossy(&buffer).to_string();
        let value = serde_json::from_str::<Value>(&text)
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
        Ok(Some(value))
    }
}

pub struct JsonRpcWriter<W: Write> {
    writer: W,
}

impl<W: Write> JsonRpcWriter<W> {
    pub fn new(writer: W) -> Self {
        Self { writer }
    }

    pub fn write_message(&mut self, value: &Value) -> io::Result<()> {
        let body = serde_json::to_string(value)
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
        write!(
            self.writer,
            "Content-Length: {}\r\n\r\n{}",
            body.len(),
            body
        )?;
        self.writer.flush()
    }
}
