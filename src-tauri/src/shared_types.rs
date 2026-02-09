use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub(crate) struct SourceOverride {
    pub(crate) path: String,
    pub(crate) content: String,
}
