use async_trait::async_trait;
use dm_domain::{Job, JobStatus, Result, Settings, SourceMetadata};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct EngineProgress {
    pub status: JobStatus,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub speed_bytes: u64,
    pub connections: u32,
    pub error: Option<dm_domain::AppError>,
}

#[async_trait]
pub trait DownloadEngine: Send + Sync {
    async fn ping(&self) -> Result<()>;
    async fn details(&self, id: &str) -> Result<Option<dm_domain::TransferDetails>>;
    async fn enqueue(&self, job: &Job, settings: &Settings) -> Result<()>;
    async fn pause(&self, id: &str) -> Result<()>;
    async fn remove(&self, id: &str) -> Result<()>;
    async fn inspect(&self, id: &str) -> Result<Option<EngineProgress>>;
    async fn configure(&self, settings: &Settings) -> Result<()>;
    async fn shutdown(&self) -> Result<()>;
}

#[async_trait]
pub trait DiagnosticRepository: Send + Sync {
    async fn record(&self, event: dm_domain::DiagnosticEvent) -> Result<()>;
    async fn diagnostics(&self, job_id: Option<&str>) -> Result<Vec<dm_domain::DiagnosticEvent>>;
}

#[async_trait]
pub trait SourceProbe: Send + Sync {
    async fn probe(&self, url: &str) -> Result<SourceMetadata>;
}

#[async_trait]
pub trait JobRepository: Send + Sync {
    async fn save(&self, job: &Job) -> Result<()>;
    async fn list(&self) -> Result<Vec<Job>>;
}
#[async_trait]
pub trait BrowserHandoffRepository: Send + Sync {
    async fn handoff(&self, request_id: &str) -> Result<Option<dm_domain::BrowserHandoff>>;
    async fn save_handoff(&self, handoff: &dm_domain::BrowserHandoff) -> Result<()>;
    /// Atomically records desktop ownership and inserts the job before engine submission.
    async fn commit_handoff(&self, handoff: &dm_domain::BrowserHandoff) -> Result<()>;
    async fn recover_handoffs(&self) -> Result<()>;
}
#[async_trait]
pub trait SettingsRepository: Send + Sync {
    async fn load_settings(&self) -> Result<Settings>;
    async fn save_settings(&self, settings: &Settings) -> Result<()>;
}

#[async_trait]
pub trait FileStore: Send + Sync {
    async fn stage(&self, destination: &str, id: &str) -> Result<PathBuf>;
    async fn verify(&self, path: &Path, expected: Option<&str>, size: Option<u64>) -> Result<()>;
    async fn finalize(&self, staging: &Path, destination: &Path) -> Result<()>;
    async fn cleanup(&self, staging: &Path) -> Result<()>;
    async fn exists(&self, path: &Path) -> bool;
}

#[async_trait]
pub trait ProcessSupervisor: Send + Sync {
    async fn stop(&self) -> Result<()>;
}
