use async_trait::async_trait;
use dm_application::ports::{DownloadEngine, EngineProgress};
use dm_domain::{AppError, ErrorCode, Job, JobStatus, Result, Settings};
use reqwest::Client;
use serde_json::{json, Value};
use std::{path::Path, time::Duration};

pub struct Aria2Engine {
    client: Client,
    endpoint: String,
    secret: String,
}
impl Aria2Engine {
    pub fn new(endpoint: String, secret: String) -> Result<Self> {
        let client = Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(5))
            .build()
            .map_err(|_| {
                AppError::new(ErrorCode::Engine, "Cannot initialize engine communication.")
            })?;
        Ok(Self {
            client,
            endpoint,
            secret,
        })
    }
    async fn rpc(&self, method: &str, mut params: Vec<Value>) -> Result<Value> {
        params.insert(0, json!(format!("token:{}", self.secret)));
        let response = self.client.post(&self.endpoint).json(&json!({"jsonrpc":"2.0","id":"download-it","method":format!("aria2.{method}"),"params":params}))
            .send().await.map_err(|_| AppError::new(ErrorCode::Engine, "The download engine is unavailable. Restart the application to recover paused downloads."))?
            .json::<Value>().await.map_err(|_| AppError::new(ErrorCode::Engine, "Invalid response from the download engine."))?;
        if response.get("error").is_some() {
            if matches!(method, "tellStatus" | "removeDownloadResult")
                && response["error"]["message"]
                    .as_str()
                    .is_some_and(|m| m.contains("not found"))
            {
                return Err(AppError::new(
                    ErrorCode::NotFound,
                    "The engine has no record of this download.",
                ));
            }
            // Do not expose raw RPC errors: they can include signed URLs or request headers.
            return Err(AppError::new(
                ErrorCode::Engine,
                format!("The download engine could not complete {method}."),
            ));
        }
        Ok(response["result"].clone())
    }
    pub async fn wait_ready(&self) -> Result<()> {
        for _ in 0..50 {
            if self.rpc("getVersion", vec![]).await.is_ok() {
                return Ok(());
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        Err(AppError::new(
            ErrorCode::Engine,
            "aria2 did not start. Check the bundled executable and local port availability.",
        ))
    }
    fn gid(id: &str) -> Result<&str> {
        if id.len() != 32 || !id.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(AppError::new(
                ErrorCode::InvalidInput,
                "Invalid download identifier.",
            ));
        }
        Ok(&id[..16])
    }
}
#[async_trait]
impl DownloadEngine for Aria2Engine {
    async fn enqueue(&self, job: &Job, settings: &Settings) -> Result<()> {
        let path = Path::new(&job.staging_path);
        let mut headers = vec!["Accept-Encoding: identity".to_owned()];
        if let Some(etag) = job.metadata.etag.as_ref().filter(|e| !e.starts_with("W/")) {
            headers.push(format!("If-Match: {etag}"));
        } else if let Some(modified) = &job.metadata.last_modified {
            headers.push(format!("If-Unmodified-Since: {modified}"));
        }
        self.rpc("addUri", vec![json!([job.url]), json!({
            "gid": Self::gid(&job.id)?, "dir": path.parent(), "out": "payload",
            "split": settings.connections_per_download.to_string(), "max-connection-per-server": settings.connections_per_download.to_string(),
            "min-split-size": "1M", "continue": "true", "always-resume": "true", "allow-overwrite": "false", "auto-file-renaming": "false",
            "max-tries": "5", "retry-wait": "5", "connect-timeout": "15", "timeout": "30", "file-allocation": "none",
            "http-accept-gzip": "false", "header": headers, "auto-save-interval": "1"
        })]).await?;
        Ok(())
    }
    async fn pause(&self, id: &str) -> Result<()> {
        self.rpc("forcePause", vec![json!(Self::gid(id)?)]).await?;
        Ok(())
    }
    async fn remove(&self, id: &str) -> Result<()> {
        let gid = Self::gid(id)?;
        if let Some(p) = self.inspect(id).await? {
            if matches!(
                p.status,
                JobStatus::Completed | JobStatus::Failed | JobStatus::Cancelled
            ) {
                self.rpc("removeDownloadResult", vec![json!(gid)]).await?;
            } else {
                self.rpc("forceRemove", vec![json!(gid)]).await?;
                // Removal finishes asynchronously; wait before reusing the stable GID.
                for _ in 0..50 {
                    match self.rpc("removeDownloadResult", vec![json!(gid)]).await {
                        Ok(_) => return Ok(()),
                        Err(e) if e.code == ErrorCode::NotFound => return Ok(()),
                        Err(_) => (),
                    }
                    tokio::time::sleep(Duration::from_millis(50)).await;
                }
                return Err(AppError::new(
                    ErrorCode::Engine,
                    "The engine is still stopping this download. Try again.",
                ));
            }
        }
        Ok(())
    }
    async fn inspect(&self, id: &str) -> Result<Option<EngineProgress>> {
        let result = self.rpc("tellStatus", vec![json!(Self::gid(id)?)]).await;
        let value = match result {
            Ok(value) => value,
            Err(e) if e.code == ErrorCode::NotFound => return Ok(None),
            Err(e) => return Err(e),
        };
        let number = |key: &str| {
            value[key]
                .as_str()
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(0)
        };
        let status = match value["status"].as_str().unwrap_or("") {
            "active" => JobStatus::Downloading,
            "waiting" => JobStatus::Queued,
            "paused" => JobStatus::Paused,
            "complete" => JobStatus::Completed,
            "removed" => JobStatus::Cancelled,
            _ => JobStatus::Failed,
        };
        let error = if status == JobStatus::Failed {
            Some(engine_error(value["errorCode"].as_str().unwrap_or("")))
        } else {
            None
        };
        let total = number("totalLength");
        Ok(Some(EngineProgress {
            status,
            downloaded_bytes: number("completedLength"),
            total_bytes: if total > 0 { Some(total) } else { None },
            speed_bytes: number("downloadSpeed"),
            connections: number("connections") as u32,
            error,
        }))
    }
    async fn configure(&self, settings: &Settings) -> Result<()> {
        settings.validate()?;
        self.rpc("changeGlobalOption", vec![json!({"max-concurrent-downloads":settings.max_active_downloads.to_string(), "max-overall-download-limit":settings.speed_limit_bytes.to_string()})]).await?;
        Ok(())
    }
    async fn shutdown(&self) -> Result<()> {
        self.rpc("forcePauseAll", vec![]).await?;
        self.rpc("shutdown", vec![]).await?;
        Ok(())
    }
}
fn engine_error(code: &str) -> AppError {
    match code {
        "9" => AppError::new(ErrorCode::Disk, "Not enough disk space. Free space and resume."),
        "13" => AppError::new(ErrorCode::Conflict, "The output file already exists."),
        "16" => AppError::new(ErrorCode::Permission, "The destination is not writable."),
        "8" => AppError::new(ErrorCode::RestartRequired, "This server cannot resume the download. Use Restart."),
        "22" | "24" => AppError::new(ErrorCode::ExpiredLink, "The link was rejected or requires authentication. Obtain a fresh direct URL."),
        "3" => AppError::new(ErrorCode::NotFound, "The file is no longer available at this link."),
        "32" => AppError::new(ErrorCode::ChecksumMismatch, "Downloaded data failed checksum verification."),
        _ => AppError::new(ErrorCode::Network, format!("Download failed (engine code {code}). Check the connection or obtain a fresh direct URL.")),
    }
}
