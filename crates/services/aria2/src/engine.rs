use async_trait::async_trait;
use dm_application::ports::{DownloadEngine, EngineProgress};
use dm_domain::{
    AppError, EngineConnection, ErrorCode, Job, JobStatus, Result, Settings, TransferDetails,
};
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
            .send().await.map_err(|e| {
                let reason = if e.is_timeout() { "timed out" } else if e.is_connect() { "could not connect" } else { "transport failed" };
                AppError::new(ErrorCode::Engine, format!("Engine request {method} {reason}. Status will retry automatically."))
            })?
            // aria2 uses HTTP 400 for valid JSON-RPC errors such as a missing GID.
            // Decode those errors before deciding whether engine communication failed.
            .json::<Value>().await.map_err(|_| AppError::new(ErrorCode::Engine, "Invalid response from the download engine."))?;
        if response.get("error").is_some() {
            if matches!(
                method,
                "tellStatus" | "getServers" | "getOption" | "removeDownloadResult"
            ) && response["error"]["message"]
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
        response
            .get("result")
            .cloned()
            .filter(|v| !v.is_null())
            .ok_or_else(|| {
                AppError::new(
                    ErrorCode::Engine,
                    "The download engine returned an incomplete response.",
                )
            })
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
    async fn ping(&self) -> Result<()> {
        self.rpc("getVersion", vec![]).await?;
        Ok(())
    }

    async fn details(&self, id: &str) -> Result<Option<TransferDetails>> {
        let gid = Self::gid(id)?;
        let value = match self
            .rpc(
                "tellStatus",
                vec![
                    json!(gid),
                    json!([
                        "status",
                        "connections",
                        "downloadSpeed",
                        "numPieces",
                        "pieceLength",
                        "bitfield"
                    ]),
                ],
            )
            .await
        {
            Ok(value) => value,
            Err(e) if e.code == ErrorCode::NotFound => return Ok(None),
            Err(e) => return Err(e),
        };
        let options = self.rpc("getOption", vec![json!(gid)]).await?;
        let servers = if value["status"] == "active" {
            self.rpc("getServers", vec![json!(gid)]).await?
        } else {
            json!([])
        };
        Ok(Some(transfer_details(&value, &options, &servers)))
    }
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
        let result = self
            .rpc(
                "tellStatus",
                vec![
                    json!(Self::gid(id)?),
                    json!([
                        "status",
                        "completedLength",
                        "totalLength",
                        "downloadSpeed",
                        "connections",
                        "errorCode"
                    ]),
                ],
            )
            .await;
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
fn transfer_details(value: &Value, options: &Value, servers: &Value) -> TransferDetails {
    let number = |v: &Value, key: &str| {
        v[key]
            .as_str()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0)
    };
    let count = number(value, "numPieces").min(u32::MAX as u64) as u32;
    let bitfield = value["bitfield"].as_str().unwrap_or("").as_bytes();
    let groups = count.min(120);
    let mut completed = vec![0_u64; groups as usize];
    let mut sizes = vec![0_u64; groups as usize];
    let mut completed_pieces = 0;
    // Bound work by the received bitmap, including for malformed responses.
    for i in 0..(count as usize).min(bitfield.len().saturating_mul(4)) {
        let group = (i as u64 * groups as u64 / count as u64) as usize;
        let nibble = (bitfield[i / 4] as char).to_digit(16).unwrap_or(0);
        let done = u64::from(nibble & (1 << (3 - i % 4)) != 0);
        completed[group] += done;
        completed_pieces += done as u32;
    }
    for (group, size) in sizes.iter_mut().enumerate() {
        let start = (group as u64 * count as u64).div_ceil(groups as u64);
        let end = ((group as u64 + 1) * count as u64).div_ceil(groups as u64);
        *size = end - start;
    }
    TransferDetails {
        connections: number(value, "connections") as u32,
        connection_limit: number(options, "split").min(number(options, "max-connection-per-server"))
            as u32,
        speed_bytes: number(value, "downloadSpeed"),
        piece_count: count,
        piece_bytes: number(value, "pieceLength"),
        completed_pieces,
        piece_groups: completed
            .iter()
            .zip(sizes)
            .map(|(done, size)| (done * 100 / size.max(1)) as u8)
            .collect(),
        servers: servers
            .as_array()
            .into_iter()
            .flatten()
            .flat_map(|file| file["servers"].as_array().into_iter().flatten())
            .filter_map(|server| {
                let url = reqwest::Url::parse(server["currentUri"].as_str()?).ok()?;
                Some(EngineConnection {
                    server: url.origin().ascii_serialization(),
                    speed_bytes: number(server, "downloadSpeed"),
                })
            })
            .collect(),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn telemetry_uses_msb_first_ignores_padding_and_redacts_server_urls() {
        let details = transfer_details(
            &json!({"numPieces":"5", "bitfield":"af", "pieceLength":"1048576", "connections":"2"}),
            &json!({"split":"8", "max-connection-per-server":"4"}),
            &json!([{"servers":[{"currentUri":"https://user:pass@cdn.example/file?token=secret#private", "downloadSpeed":"42"}]}]),
        );
        assert_eq!(details.piece_groups, vec![100, 0, 100, 0, 100]);
        assert_eq!(details.completed_pieces, 3);
        assert_eq!(details.connection_limit, 4);
        assert_eq!(details.servers[0].server, "https://cdn.example");
        assert_eq!(details.servers[0].speed_bytes, 42);
        assert_eq!(
            transfer_details(&json!({}), &json!({}), &json!([])).piece_groups,
            Vec::<u8>::new()
        );
    }

    #[test]
    fn large_piece_maps_are_bounded_and_preserve_completion() {
        let details = transfer_details(
            &json!({"numPieces":"1001", "bitfield":"f".repeat(251)}),
            &json!({}),
            &json!([]),
        );
        assert_eq!(details.completed_pieces, 1001);
        assert_eq!(details.piece_groups, vec![100; 120]);
    }
}
