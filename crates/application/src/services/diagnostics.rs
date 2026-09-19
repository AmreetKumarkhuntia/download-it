use super::DownloadService;
use crate::ports::DiagnosticRepository;
use dm_contracts::DownloadDetails;
use dm_domain::{timestamp, DiagnosticEvent, EngineHealth, ErrorCode, Result};
use std::sync::Arc;
use url::Url;

impl DownloadService {
    pub fn with_diagnostics(mut self, repository: Arc<dyn DiagnosticRepository>) -> Self {
        self.diagnostics = Some(repository);
        self
    }

    pub async fn engine_health(&self) -> EngineHealth {
        self.health.lock().await.clone()
    }

    /// A saved download list is not proof that the engine is reachable. Probe even
    /// with zero live jobs, and clear a failure only after a successful engine poll.
    pub async fn poll(&self) -> EngineHealth {
        let result = match self.engine.ping().await {
            Ok(()) => self.tick().await,
            Err(error) => Err(error),
        };
        let (event, message) = {
            let mut health = self.health.lock().await;
            let previous = health.error.as_ref().map(|e| (&e.code, &e.message));
            let next = result.as_ref().err().map(|e| (&e.code, &e.message));
            let changed =
                health.checked_at.is_none() || previous != next || health.log_error.is_some();
            health.checked_at = Some(timestamp());
            health.connected = !result.as_ref().is_err_and(|e| e.code == ErrorCode::Engine);
            match result {
                Ok(()) => {
                    health.last_success_at = health.checked_at.clone();
                    health.consecutive_failures = 0;
                    health.error = None;
                    (
                        changed.then_some("engine.connected"),
                        "Engine communication and progress polling succeeded.".into(),
                    )
                }
                Err(error) => {
                    health.consecutive_failures = health.consecutive_failures.saturating_add(1);
                    let message = format!("{:?}: {}", error.code, error.message);
                    health.error = Some(error);
                    (changed.then_some("engine.poll_failed"), message)
                }
            }
        };
        if let Some(event) = event {
            self.record_event(
                if event == "engine.connected" {
                    "info"
                } else {
                    "error"
                },
                event,
                None,
                message,
            )
            .await;
        }
        self.engine_health().await
    }

    pub async fn record_event(
        &self,
        level: &str,
        event: &str,
        job_id: Option<&str>,
        message: String,
    ) {
        if let Some(repository) = &self.diagnostics {
            let result = repository
                .record(DiagnosticEvent {
                    timestamp: timestamp(),
                    level: level.into(),
                    event: event.into(),
                    job_id: job_id.map(str::to_owned),
                    message,
                })
                .await;
            self.health.lock().await.log_error = result.err();
        }
    }

    pub async fn diagnostics(&self, job_id: Option<&str>) -> Result<Vec<DiagnosticEvent>> {
        match &self.diagnostics {
            Some(repository) => repository.diagnostics(job_id).await,
            None => Ok(vec![]),
        }
    }

    pub async fn details(&self, id: &str) -> Result<DownloadDetails> {
        let _guard = self.operation.lock().await;
        let job = self.get(id).await?;
        let telemetry = if job.status.is_live() || job.status == dm_domain::JobStatus::Paused {
            self.engine.details(id).await
        } else {
            Ok(None)
        };
        let (transfer, telemetry_error) = match telemetry {
            Ok(transfer) => (transfer, None),
            Err(error) => (None, Some(error)),
        };
        Ok(DownloadDetails {
            source_url: display_url(&job.url),
            effective_url: job.metadata.effective_url.as_deref().map(display_url),
            content_type: job.metadata.content_type.clone(),
            etag: job.metadata.etag.clone(),
            last_modified: job.metadata.last_modified.clone(),
            range_supported: job.metadata.range_supported,
            expected_sha256: job.expected_sha256.clone(),
            resume_validator: job.metadata.can_resume_with(&job.metadata),
            job: (&job).into(),
            transfer,
            telemetry_error,
            settings: self.settings.load_settings().await?,
            sampled_at: timestamp(),
        })
    }
}

fn display_url(raw: &str) -> String {
    let Ok(mut url) = Url::parse(raw) else {
        return "Unavailable".into();
    };
    let hidden = url.query().is_some() || url.fragment().is_some();
    let _ = url.set_username("");
    let _ = url.set_password(None);
    url.set_query(None);
    url.set_fragment(None);
    format!(
        "{url}{}",
        if hidden {
            " [query/fragment hidden]"
        } else {
            ""
        }
    )
}

#[cfg(test)]
#[path = "../../../../tests/rust/application/diagnostics.unit.rs"]
mod tests;
