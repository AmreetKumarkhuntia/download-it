use super::DownloadService;
use crate::ports::BrowserHandoffRepository;
use dm_contracts::{
    AddDownloadRequest, BrowserFileEvidence, BrowserOperation, BrowserRequest, BrowserResponse,
    BrowserState, JobView, BROWSER_PROTOCOL_VERSION,
};
use dm_domain::{
    AppError, BrowserHandoff, ErrorCode, HandoffState, JobStatus, Result, SourceMetadata,
};
use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{SystemTime, UNIX_EPOCH},
};

pub struct BrowserService {
    downloads: Arc<DownloadService>,
    records: Arc<dyn BrowserHandoffRepository>,
    stopping: AtomicBool,
}

impl BrowserService {
    pub fn new(
        downloads: Arc<DownloadService>,
        records: Arc<dyn BrowserHandoffRepository>,
    ) -> Self {
        Self {
            downloads,
            records,
            stopping: AtomicBool::new(false),
        }
    }

    pub fn stop(&self) {
        self.stopping.store(true, Ordering::SeqCst);
    }

    pub async fn handle(&self, request: BrowserRequest) -> BrowserResponse {
        let id = request.request_id.clone();
        match self.dispatch(request).await {
            Ok((state, job)) => BrowserResponse {
                version: BROWSER_PROTOCOL_VERSION,
                request_id: id,
                state,
                job,
                error: None,
            },
            Err(error) => BrowserResponse {
                version: BROWSER_PROTOCOL_VERSION,
                request_id: id,
                state: BrowserState::Error,
                job: None,
                error: Some(error),
            },
        }
    }

    async fn dispatch(&self, request: BrowserRequest) -> Result<(BrowserState, Option<JobView>)> {
        if request.version != BROWSER_PROTOCOL_VERSION {
            return Err(invalid(
                "Browser protocol mismatch. Rebuild the extension and desktop app together.",
            ));
        }
        if uuid::Uuid::parse_str(&request.request_id).is_err() {
            return Err(invalid("Invalid browser request ID."));
        }
        let _guard = self.downloads.operation.lock().await;
        if self.stopping.load(Ordering::SeqCst) {
            return Err(AppError::new(
                ErrorCode::Conflict,
                "Download It is closing. Keep this download in the browser.",
            ));
        }
        if matches!(request.command, BrowserOperation::Hello) {
            return Ok((BrowserState::Ready, None));
        }
        let mut existing = self.records.handoff(&request.request_id).await?;
        if let Some(h) = &mut existing {
            if h.state == HandoffState::Prepared && h.expires_at <= now() {
                h.state = HandoffState::Aborted;
                self.records.save_handoff(h).await?;
                let _ = self
                    .downloads
                    .files
                    .cleanup(Path::new(&h.job.staging_path))
                    .await;
            }
        }
        match request.command {
            BrowserOperation::Prepare {
                url,
                filename,
                evidence,
            } => {
                if let Some(h) = existing {
                    return self.view(&h).await;
                }
                if url.len() > 16_384 {
                    return Err(invalid("The download URL is too long."));
                }
                let destination = self
                    .downloads
                    .settings
                    .load_settings()
                    .await?
                    .default_directory;
                let job = self
                    .downloads
                    .prepare_job(AddDownloadRequest {
                        url,
                        destination,
                        filename,
                        expected_sha256: None,
                    })
                    .await?;
                if let Err(error) = validate_source(&job.metadata, evidence.as_ref()) {
                    let _ = self
                        .downloads
                        .files
                        .cleanup(Path::new(&job.staging_path))
                        .await;
                    return Err(error);
                }
                let h = BrowserHandoff {
                    request_id: request.request_id,
                    expires_at: now() + 30,
                    state: HandoffState::Prepared,
                    job,
                };
                self.records.save_handoff(&h).await?;
                self.view(&h).await
            }
            BrowserOperation::Commit => {
                let Some(mut h) = existing else {
                    return Ok((BrowserState::NotFound, None));
                };
                if h.state != HandoffState::Prepared {
                    return self.view(&h).await;
                }
                let settings = self.downloads.settings.load_settings().await?;
                h.state = HandoffState::Committing;
                self.records.commit_handoff(&h).await?;
                match self.downloads.engine.enqueue(&h.job, &settings).await {
                    Ok(()) => h.state = HandoffState::Committed,
                    Err(error) => {
                        // An RPC failure can mean the engine accepted the transfer but its reply
                        // was lost. Only hand ownership back after confirmed removal.
                        if self.downloads.engine.remove(&h.job.id).await.is_ok() {
                            h.job.status = JobStatus::Failed;
                            h.job.error = Some(error);
                            self.downloads.jobs.save(&h.job).await?;
                            h.state = HandoffState::Failed;
                        }
                    }
                }
                self.records.save_handoff(&h).await?;
                self.view(&h).await
            }
            BrowserOperation::Abort => {
                let Some(mut h) = existing else {
                    return Ok((BrowserState::NotFound, None));
                };
                if h.state == HandoffState::Prepared {
                    h.state = HandoffState::Aborted;
                    self.records.save_handoff(&h).await?;
                    let _ = self
                        .downloads
                        .files
                        .cleanup(Path::new(&h.job.staging_path))
                        .await;
                }
                self.view(&h).await
            }
            BrowserOperation::Status => match existing {
                Some(h) => self.view(&h).await,
                None => Ok((BrowserState::NotFound, None)),
            },
            BrowserOperation::Hello => unreachable!(),
        }
    }

    async fn view(&self, h: &BrowserHandoff) -> Result<(BrowserState, Option<JobView>)> {
        let state = match h.state {
            HandoffState::Prepared => BrowserState::Prepared,
            HandoffState::Committing => BrowserState::Committing,
            HandoffState::Committed => BrowserState::Committed,
            HandoffState::Aborted => BrowserState::Aborted,
            HandoffState::Failed => BrowserState::Failed,
        };
        let job = if matches!(
            h.state,
            HandoffState::Committed | HandoffState::Committing | HandoffState::Failed
        ) {
            Some(JobView::from(&self.downloads.get(&h.job.id).await?))
        } else {
            None
        };
        Ok((state, job))
    }
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn invalid(message: &str) -> AppError {
    AppError::new(ErrorCode::InvalidInput, message)
}

fn validate_source(
    metadata: &SourceMetadata,
    evidence: Option<&BrowserFileEvidence>,
) -> Result<()> {
    if matches!(
        metadata.content_type.as_deref(),
        Some("text/html" | "application/xhtml+xml")
    ) {
        return Err(invalid("This link returns a web page. Use a direct file URL or keep the download in your browser."));
    }
    if let Some(e) = evidence {
        let observed = SourceMetadata {
            total_bytes: Some(e.total_bytes),
            etag: e.etag.clone(),
            last_modified: e.last_modified.clone(),
            ..Default::default()
        };
        if e.method != "GET"
            || e.total_bytes > 9_007_199_254_740_991
            || e.content_type.is_empty()
            || metadata.content_type.as_deref() != Some(e.content_type.as_str())
            || !observed.can_resume_with(metadata)
        {
            return Err(invalid("The file cannot be verified without browser credentials. Keeping it in the browser."));
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "../../../../tests/rust/application/browser.unit.rs"]
mod tests;
