use dm_domain::{AppError, Job, JobStatus};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AddDownloadRequest {
    pub url: String,
    pub destination: String,
    pub filename: Option<String>,
    pub expected_sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct JobView {
    pub id: String,
    pub source_host: String,
    pub filename: String,
    pub destination: String,
    pub final_path: Option<String>,
    pub status: JobStatus,
    #[ts(type = "number")]
    pub downloaded_bytes: u64,
    #[ts(type = "number | null")]
    pub total_bytes: Option<u64>,
    #[ts(type = "number")]
    pub speed_bytes: u64,
    #[ts(type = "number | null")]
    pub eta_seconds: Option<u64>,
    pub connections: u32,
    pub created_at: String,
    pub error: Option<AppError>,
}
impl From<&Job> for JobView {
    fn from(j: &Job) -> Self {
        Self {
            id: j.id.clone(),
            source_host: j.source_host.clone(),
            filename: j.filename.clone(),
            destination: j.destination.clone(),
            final_path: j.final_path.clone(),
            status: j.status.clone(),
            downloaded_bytes: j.downloaded_bytes,
            total_bytes: j.metadata.total_bytes,
            speed_bytes: j.speed_bytes,
            eta_seconds: if j.speed_bytes > 0 {
                j.metadata
                    .total_bytes
                    .map(|n| n.saturating_sub(j.downloaded_bytes) / j.speed_bytes)
            } else {
                None
            },
            connections: j.connections,
            created_at: j.created_at.clone(),
            error: j.error.clone(),
        }
    }
}
