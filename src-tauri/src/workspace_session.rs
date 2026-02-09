use std::time::{SystemTime, UNIX_EPOCH};

pub struct WorkspaceSessionState {
    id: String,
}

impl WorkspaceSessionState {
    pub fn new() -> Self {
        let pid = std::process::id();
        let started_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or(0);
        Self {
            id: format!("session-{pid}-{started_ms}"),
        }
    }

    pub fn id(&self) -> &str {
        &self.id
    }
}
