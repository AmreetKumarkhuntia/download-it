use crate::ports::*;
use dm_contracts::{AddDownloadRequest, JobView};
use dm_domain::{AppError, ErrorCode, Job, JobStatus, Result, Settings};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex;
use url::Url;

pub struct DownloadService {
    pub(super) engine: Arc<dyn DownloadEngine>,
    pub(super) probe: Arc<dyn SourceProbe>,
    pub(super) jobs: Arc<dyn JobRepository>,
    pub(super) settings: Arc<dyn SettingsRepository>,
    pub(super) files: Arc<dyn FileStore>,
    // Serializes state changes, including polling, so pause/cancel cannot race completion.
    pub(super) operation: Mutex<()>,
}

impl DownloadService {
    pub fn new(
        engine: Arc<dyn DownloadEngine>,
        probe: Arc<dyn SourceProbe>,
        jobs: Arc<dyn JobRepository>,
        settings: Arc<dyn SettingsRepository>,
        files: Arc<dyn FileStore>,
    ) -> Self {
        Self {
            engine,
            probe,
            jobs,
            settings,
            files,
            operation: Mutex::new(()),
        }
    }

    pub async fn recover(&self) -> Result<()> {
        let _guard = self.operation.lock().await;
        self.engine
            .configure(&self.settings.load_settings().await?)
            .await?;
        for mut job in self.jobs.list().await? {
            if job.status == JobStatus::Verifying {
                self.complete(&mut job).await?;
            } else if job.status.is_live() {
                job.status = JobStatus::Paused;
                job.speed_bytes = 0;
                job.connections = 0;
                self.jobs.save(&job).await?;
            }
        }
        Ok(())
    }

    pub async fn list(&self) -> Result<Vec<JobView>> {
        Ok(self.jobs.list().await?.iter().map(JobView::from).collect())
    }

    pub async fn add(&self, input: AddDownloadRequest) -> Result<JobView> {
        let _guard = self.operation.lock().await;
        let mut job = self.prepare_job(input).await?;
        self.jobs.save(&job).await?;
        if let Err(e) = self
            .engine
            .enqueue(&job, &self.settings.load_settings().await?)
            .await
        {
            job.status = JobStatus::Failed;
            job.error = Some(e);
            self.jobs.save(&job).await?;
        }
        Ok(JobView::from(&job))
    }

    pub(super) async fn prepare_job(&self, input: AddDownloadRequest) -> Result<Job> {
        let url = Url::parse(input.url.trim()).map_err(|_| {
            AppError::new(
                ErrorCode::InvalidInput,
                "Enter a valid HTTP or HTTPS file URL.",
            )
        })?;
        if !matches!(url.scheme(), "http" | "https")
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return Err(AppError::new(
                ErrorCode::InvalidInput,
                "Only HTTP/HTTPS links without embedded login credentials are supported.",
            ));
        }
        let expected = input
            .expected_sha256
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.trim().to_ascii_lowercase());
        if expected
            .as_ref()
            .is_some_and(|s| s.len() != 64 || !s.bytes().all(|b| b.is_ascii_hexdigit()))
        {
            return Err(AppError::new(
                ErrorCode::InvalidInput,
                "SHA-256 must contain exactly 64 hexadecimal characters.",
            ));
        }
        if !Path::new(&input.destination).is_absolute() {
            return Err(AppError::new(
                ErrorCode::InvalidInput,
                "Choose an absolute destination directory.",
            ));
        }
        let metadata = self.probe.probe(url.as_str()).await?;
        let candidate = input
            .filename
            .filter(|s| !s.trim().is_empty())
            .or_else(|| metadata.filename.clone())
            .or_else(|| {
                url.path_segments()
                    .and_then(|mut s| s.next_back())
                    .filter(|s| !s.is_empty())
                    .map(str::to_owned)
            })
            .unwrap_or_else(|| "download".into());
        let filename = safe_filename(&candidate)?;
        let id = uuid::Uuid::new_v4().simple().to_string();
        let staging = self.files.stage(&input.destination, &id).await?;
        let job = Job {
            id,
            url: url.to_string(),
            source_host: url.host_str().unwrap().into(),
            filename,
            destination: input.destination,
            staging_path: staging.to_string_lossy().into_owned(),
            final_path: None,
            status: JobStatus::Queued,
            metadata,
            expected_sha256: expected,
            downloaded_bytes: 0,
            speed_bytes: 0,
            connections: 0,
            created_at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
                .to_string(),
            error: None,
        };
        Ok(job)
    }

    pub(super) async fn get(&self, id: &str) -> Result<Job> {
        self.jobs
            .list()
            .await?
            .into_iter()
            .find(|j| j.id == id)
            .ok_or_else(|| AppError::new(ErrorCode::NotFound, "Download not found."))
    }

    pub async fn pause(&self, id: &str) -> Result<()> {
        let _guard = self.operation.lock().await;
        let mut j = self.get(id).await?;
        if j.status.is_live() {
            self.engine.pause(id).await?;
            if let Some(progress) = self.engine.inspect(id).await? {
                j.downloaded_bytes = progress.downloaded_bytes;
            }
            j.status = JobStatus::Paused;
            j.speed_bytes = 0;
            j.connections = 0;
            self.jobs.save(&j).await?;
        }
        Ok(())
    }

    /// Restart is explicit because it discards this job's incomplete bytes.
    pub async fn resume(&self, id: &str, restart: bool) -> Result<()> {
        let _guard = self.operation.lock().await;
        let mut j = self.get(id).await?;
        if !matches!(
            j.status,
            JobStatus::Paused | JobStatus::Failed | JobStatus::Cancelled
        ) {
            return Err(AppError::new(
                ErrorCode::Conflict,
                "Only paused, failed, or cancelled downloads can be resumed.",
            ));
        }
        if !restart && j.final_path.is_some() {
            if j.error
                .as_ref()
                .is_some_and(|e| e.code == ErrorCode::Conflict)
            {
                j.final_path = None;
            }
            self.complete(&mut j).await?;
            return if let Some(error) = j.error {
                Err(error)
            } else {
                Ok(())
            };
        }
        let current = self.probe.probe(&j.url).await?;
        let has_partial = self.files.exists(Path::new(&j.staging_path)).await;
        if !restart && has_partial && !j.metadata.can_resume_with(&current) {
            return Err(AppError::new(
                ErrorCode::RestartRequired,
                "The source changed or cannot be verified. Use Restart to download a fresh copy.",
            ));
        }
        self.engine.remove(id).await?;
        if restart {
            self.files.cleanup(Path::new(&j.staging_path)).await?;
            self.files.stage(&j.destination, &j.id).await?;
            j.downloaded_bytes = 0;
            j.final_path = None;
        }
        j.metadata = current;
        j.error = None;
        j.status = JobStatus::Queued;
        self.jobs.save(&j).await?;
        if let Err(e) = self
            .engine
            .enqueue(&j, &self.settings.load_settings().await?)
            .await
        {
            j.status = JobStatus::Failed;
            j.error = Some(e.clone());
            self.jobs.save(&j).await?;
            return Err(e);
        }
        Ok(())
    }

    pub async fn cancel(&self, id: &str) -> Result<()> {
        let _guard = self.operation.lock().await;
        let mut j = self.get(id).await?;
        if j.status == JobStatus::Completed {
            return Ok(());
        }
        self.engine.remove(id).await?;
        j.status = JobStatus::Cancelled;
        j.speed_bytes = 0;
        j.connections = 0;
        self.jobs.save(&j).await?;
        // Partial data is kept so cancellation is recoverable through Resume or Restart.
        Ok(())
    }

    pub async fn tick(&self) -> Result<()> {
        let _guard = self.operation.lock().await;
        for mut j in self.jobs.list().await? {
            if !j.status.is_live() {
                continue;
            }
            let progress = match self.engine.inspect(&j.id).await {
                Ok(Some(p)) => p,
                Ok(None) => {
                    j.status = JobStatus::Failed;
                    j.error = Some(AppError::new(
                        ErrorCode::Engine,
                        "The download engine lost this job. Resume it to recover.",
                    ));
                    j.speed_bytes = 0;
                    self.jobs.save(&j).await?;
                    continue;
                }
                Err(e) => return Err(e),
            };
            j.downloaded_bytes = progress.downloaded_bytes;
            j.metadata.total_bytes = progress.total_bytes.or(j.metadata.total_bytes);
            j.speed_bytes = progress.speed_bytes;
            j.connections = progress.connections;
            j.error = progress.error;
            if progress.status == JobStatus::Completed {
                j.status = JobStatus::Verifying;
                j.speed_bytes = 0;
                j.connections = 0;
                self.jobs.save(&j).await?;
                self.complete(&mut j).await?;
            } else {
                j.status = progress.status;
                self.jobs.save(&j).await?;
            }
        }
        Ok(())
    }

    async fn complete(&self, j: &mut Job) -> Result<()> {
        let outcome = async {
            let staging = Path::new(&j.staging_path);
            self.files
                .verify(
                    staging,
                    j.expected_sha256.as_deref(),
                    j.metadata.total_bytes,
                )
                .await?;
            if j.final_path.is_none() {
                let requested = Path::new(&j.destination).join(&j.filename);
                let mut candidate = requested.clone();
                let mut index = 1;
                while self.files.exists(&candidate).await {
                    let stem = requested.file_stem().unwrap_or_default().to_string_lossy();
                    let ext = requested
                        .extension()
                        .map(|e| format!(".{}", e.to_string_lossy()))
                        .unwrap_or_default();
                    candidate = Path::new(&j.destination).join(format!("{stem} ({index}){ext}"));
                    index += 1;
                }
                j.final_path = Some(candidate.to_string_lossy().into_owned());
                self.jobs.save(j).await?;
            }
            self.files
                .finalize(staging, &PathBuf::from(j.final_path.as_ref().unwrap()))
                .await
        }
        .await;
        match outcome {
            Ok(()) => {
                j.status = JobStatus::Completed;
                j.error = None;
            }
            Err(e) => {
                j.status = JobStatus::Failed;
                j.error = Some(e);
            }
        }
        self.jobs.save(j).await?;
        if j.status == JobStatus::Completed {
            // Final data is durable before staging is removed. Cleanup failure is recoverable.
            let _ = self.files.cleanup(Path::new(&j.staging_path)).await;
        }
        Ok(())
    }

    pub async fn get_settings(&self) -> Result<Settings> {
        self.settings.load_settings().await
    }
    pub async fn update_settings(&self, settings: Settings) -> Result<()> {
        settings.validate()?;
        let _guard = self.operation.lock().await;
        self.engine.configure(&settings).await?;
        self.settings.save_settings(&settings).await
    }
    pub async fn shutdown(&self) -> Result<()> {
        let _guard = self.operation.lock().await;
        let result = self.engine.shutdown().await;
        for mut j in self.jobs.list().await? {
            if j.status.is_live() {
                j.status = JobStatus::Paused;
                j.speed_bytes = 0;
                j.connections = 0;
                self.jobs.save(&j).await?;
            }
        }
        result
    }
}

fn safe_filename(value: &str) -> Result<String> {
    let name: String = value
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    let name = name.trim().trim_end_matches('.');
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserved = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.len() > 180
        || reserved.contains(&stem.as_str())
    {
        return Err(AppError::new(
            ErrorCode::InvalidInput,
            "Choose a valid filename shorter than 180 bytes.",
        ));
    }
    Ok(name.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn filename_cannot_escape_destination() {
        assert_eq!(safe_filename("../../hello.exe").unwrap(), ".._.._hello.exe");
        assert!(safe_filename("CON.txt").is_err());
        assert!(safe_filename("..").is_err());
    }
}
