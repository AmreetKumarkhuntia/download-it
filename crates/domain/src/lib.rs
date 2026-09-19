use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    InvalidInput,
    Network,
    ExpiredLink,
    Permission,
    Disk,
    Engine,
    Persistence,
    SourceChanged,
    RestartRequired,
    ChecksumMismatch,
    NotFound,
    Conflict,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
}

impl AppError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}
impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}
impl std::error::Error for AppError {}
pub type Result<T> = std::result::Result<T, AppError>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Queued,
    Downloading,
    Paused,
    Verifying,
    Completed,
    Failed,
    Cancelled,
}
impl JobStatus {
    pub fn is_live(&self) -> bool {
        matches!(self, Self::Queued | Self::Downloading)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SourceMetadata {
    pub total_bytes: Option<u64>,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub filename: Option<String>,
    #[serde(default)]
    pub content_type: Option<String>,
}

/// Durable browser handoff ownership; prepared jobs have not entered the engine.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HandoffState {
    Prepared,
    Committing,
    Committed,
    Aborted,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserHandoff {
    pub request_id: String,
    pub expires_at: u64,
    pub state: HandoffState,
    pub job: Job,
}
impl SourceMetadata {
    pub fn can_resume_with(&self, other: &Self) -> bool {
        if self.total_bytes != other.total_bytes {
            return false;
        }
        if let Some(etag) = self.etag.as_ref().filter(|e| !e.starts_with("W/")) {
            return other.etag.as_ref() == Some(etag);
        }
        self.total_bytes.is_some()
            && self.last_modified.is_some()
            && self.last_modified == other.last_modified
    }
}

/// Internal durable model. Never send this to the renderer: URLs can contain credentials.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Job {
    pub id: String,
    pub url: String,
    pub source_host: String,
    pub filename: String,
    pub destination: String,
    pub staging_path: String,
    pub final_path: Option<String>,
    pub status: JobStatus,
    pub metadata: SourceMetadata,
    pub expected_sha256: Option<String>,
    pub downloaded_bytes: u64,
    pub speed_bytes: u64,
    pub connections: u32,
    pub created_at: String,
    pub error: Option<AppError>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub max_active_downloads: u32,
    pub connections_per_download: u32,
    #[ts(type = "number")]
    pub speed_limit_bytes: u64,
    pub default_directory: String,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            max_active_downloads: 3,
            connections_per_download: 8,
            speed_limit_bytes: 0,
            default_directory: String::new(),
        }
    }
}
impl Settings {
    pub fn validate(&self) -> Result<()> {
        if !(1..=10).contains(&self.max_active_downloads)
            || !(1..=16).contains(&self.connections_per_download)
        {
            return Err(AppError::new(
                ErrorCode::InvalidInput,
                "Use 1–10 active downloads and 1–16 connections per download.",
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resume_requires_matching_usable_validators() {
        let original = SourceMetadata {
            total_bytes: Some(42),
            etag: Some("\"stable\"".into()),
            ..Default::default()
        };
        assert!(original.can_resume_with(&original));
        assert!(!original.can_resume_with(&SourceMetadata {
            total_bytes: Some(43),
            ..original.clone()
        }));
        assert!(!SourceMetadata::default().can_resume_with(&SourceMetadata::default()));
        let weak = SourceMetadata {
            etag: Some("W/\"weak\"".into()),
            total_bytes: Some(42),
            ..Default::default()
        };
        assert!(!weak.can_resume_with(&weak));
    }
}
