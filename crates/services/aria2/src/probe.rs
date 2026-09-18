use async_trait::async_trait;
use dm_application::ports::SourceProbe;
use dm_domain::{AppError, ErrorCode, Result, SourceMetadata};
use reqwest::{header, Client, StatusCode};
use std::time::Duration;

pub struct HttpSourceProbe {
    client: Client,
}
impl HttpSourceProbe {
    pub fn new() -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(20))
            .redirect(reqwest::redirect::Policy::limited(10))
            .user_agent("DownloadIt/0.1")
            .build()
            .map_err(|_| AppError::new(ErrorCode::Network, "Cannot initialize HTTP requests."))?;
        Ok(Self { client })
    }
}
#[async_trait]
impl SourceProbe for HttpSourceProbe {
    async fn probe(&self, url: &str) -> Result<SourceMetadata> {
        // GET rather than HEAD also supports signed URLs whose signature is method-specific.
        // Dropping the response after its headers prevents buffering the actual file.
        let response = self
            .client
            .get(url)
            .header(header::RANGE, "bytes=0-0")
            .header(header::ACCEPT_ENCODING, "identity")
            .send()
            .await
            .map_err(|_| {
                AppError::new(
                    ErrorCode::Network,
                    "Cannot reach the file server. Check the URL and your connection.",
                )
            })?;
        let status = response.status();
        if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
            return Err(AppError::new(
                ErrorCode::ExpiredLink,
                "The link has expired or requires a login. Use a fresh direct file URL.",
            ));
        }
        if status == StatusCode::PRECONDITION_FAILED {
            return Err(AppError::new(
                ErrorCode::SourceChanged,
                "The remote file has changed.",
            ));
        }
        let h = response.headers();
        let get = |name| h.get(name).and_then(|v| v.to_str().ok()).map(str::to_owned);
        let content_range = get(header::CONTENT_RANGE);
        let total = if status == StatusCode::PARTIAL_CONTENT
            || status == StatusCode::RANGE_NOT_SATISFIABLE
        {
            content_range.and_then(|s| s.rsplit('/').next()?.parse().ok())
        } else {
            get(header::CONTENT_LENGTH).and_then(|s| s.parse().ok())
        };
        if !status.is_success()
            && !(status == StatusCode::RANGE_NOT_SATISFIABLE && total == Some(0))
        {
            return Err(AppError::new(
                ErrorCode::Network,
                format!("The file server returned HTTP {}.", status.as_u16()),
            ));
        }
        let filename = get(header::CONTENT_DISPOSITION).and_then(|s| {
            s.split(';').find_map(|part| {
                part.trim()
                    .strip_prefix("filename=")
                    .map(|s| s.trim_matches('"').to_owned())
            })
        });
        Ok(SourceMetadata {
            total_bytes: total,
            etag: get(header::ETAG),
            last_modified: get(header::LAST_MODIFIED),
            filename,
        })
    }
}
