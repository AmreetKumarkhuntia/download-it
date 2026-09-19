//! Real-process contract tests. Run with ARIA2_BIN=/absolute/path/to/aria2c cargo test -p dm-aria2 --test transfers -- --ignored.
use dm_application::{
    ports::{DownloadEngine, ProcessSupervisor, SettingsRepository},
    services::{BrowserService, DownloadService},
};
use dm_aria2::{Aria2Engine, HttpSourceProbe};
use dm_contracts::{
    AddDownloadRequest, BrowserFileEvidence, BrowserOperation, BrowserRequest, BrowserState,
    JobView,
};
use dm_domain::{ErrorCode, JobStatus};
use dm_filesystem::LocalFileStore;
use dm_process::Aria2Process;
use dm_sqlite::SqliteService;
use sha2::{Digest, Sha256};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

struct Server {
    url: String,
    data: Arc<Vec<u8>>,
    ranges: Arc<AtomicUsize>,
    version: Arc<AtomicUsize>,
    task: tokio::task::JoinHandle<()>,
}
impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}
impl Server {
    async fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let data = Arc::new(
            (0..8 * 1024 * 1024)
                .map(|i| (i % 251) as u8)
                .collect::<Vec<_>>(),
        );
        let ranges = Arc::new(AtomicUsize::new(0));
        let version = Arc::new(AtomicUsize::new(1));
        let payload = data.clone();
        let requests = ranges.clone();
        let revision = version.clone();
        let task = tokio::spawn(async move {
            loop {
                let Ok((mut stream, _)) = listener.accept().await else {
                    break;
                };
                let data = payload.clone();
                let ranges = requests.clone();
                let version = revision.clone();
                tokio::spawn(async move {
                    let mut request = Vec::new();
                    while !request.ends_with(b"\r\n\r\n") && request.len() < 16384 {
                        let mut byte = [0u8];
                        if stream.read_exact(&mut byte).await.is_err() {
                            return;
                        }
                        request.push(byte[0]);
                    }
                    let request = String::from_utf8_lossy(&request).to_ascii_lowercase();
                    let path = request
                        .lines()
                        .next()
                        .unwrap()
                        .split_whitespace()
                        .nth(1)
                        .unwrap();
                    if path.starts_with("/expired") {
                        let _ = stream.write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;
                        return;
                    }
                    if path.starts_with("/redirect") {
                        let _ = stream.write_all(b"HTTP/1.1 302 Found\r\nLocation: /file\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;
                        return;
                    }
                    let ranged = !path.starts_with("/sequential") && !path.starts_with("/unknown");
                    let mut start = 0usize;
                    let mut end = data.len() - 1;
                    let mut partial = false;
                    if ranged {
                        if let Some(range) = request
                            .lines()
                            .find_map(|s| s.strip_prefix("range: bytes="))
                        {
                            let (a, b) = range.split_once('-').unwrap();
                            start = a.parse().unwrap();
                            end = b.parse().unwrap_or(end).min(end);
                            partial = true;
                            ranges.fetch_add(1, Ordering::SeqCst);
                        }
                    }
                    if start > end {
                        let _ = stream.write_all(b"HTTP/1.1 416 Range Not Satisfiable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;
                        return;
                    }
                    let mut headers = format!("HTTP/1.1 {}\r\nConnection: close\r\nETag: \"version-{}\"\r\nContent-Disposition: attachment; filename=sample.bin\r\n", if partial { "206 Partial Content" } else { "200 OK" }, version.load(Ordering::SeqCst));
                    if !path.starts_with("/unknown") {
                        headers += &format!("Content-Length: {}\r\n", end - start + 1);
                    }
                    if partial {
                        headers +=
                            &format!("Content-Range: bytes {start}-{end}/{}\r\n", data.len());
                    }
                    headers += "Content-Type: application/octet-stream\r\n\r\n";
                    if stream.write_all(headers.as_bytes()).await.is_err() {
                        return;
                    }
                    for chunk in data[start..=end].chunks(65536) {
                        if stream.write_all(chunk).await.is_err() {
                            break;
                        }
                        tokio::time::sleep(Duration::from_millis(4)).await;
                    }
                });
            }
        });
        Self {
            url,
            data,
            ranges,
            version,
            task,
        }
    }
}

struct Harness {
    service: Arc<DownloadService>,
    db: Arc<SqliteService>,
    process: Arc<Aria2Process>,
    engine: Arc<Aria2Engine>,
    dir: tempfile::TempDir,
}
impl Harness {
    async fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let binary = PathBuf::from(
            std::env::var("ARIA2_BIN").expect("Set ARIA2_BIN to an absolute aria2 executable path"),
        );
        let process = Arc::new(Aria2Process::start(&binary, dir.path()).unwrap());
        let engine =
            Arc::new(Aria2Engine::new(process.endpoint.clone(), process.secret.clone()).unwrap());
        engine.wait_ready().await.unwrap();
        let db = Arc::new(SqliteService::open(&dir.path().join("jobs.sqlite")).unwrap());
        let service = Arc::new(DownloadService::new(
            engine.clone(),
            Arc::new(HttpSourceProbe::new().unwrap()),
            db.clone(),
            db.clone(),
            Arc::new(LocalFileStore),
        ));
        service.recover().await.unwrap();
        Self {
            service,
            db,
            process,
            engine,
            dir,
        }
    }
    async fn add(&self, url: String, checksum: Option<String>) -> JobView {
        self.service
            .add(AddDownloadRequest {
                url,
                destination: self.dir.path().to_str().unwrap().into(),
                filename: None,
                expected_sha256: checksum,
            })
            .await
            .unwrap()
    }
    async fn finish(&self, id: &str) -> JobView {
        for _ in 0..200 {
            self.service.tick().await.unwrap();
            let job = self
                .service
                .list()
                .await
                .unwrap()
                .into_iter()
                .find(|j| j.id == id)
                .unwrap();
            if matches!(job.status, JobStatus::Completed | JobStatus::Failed) {
                return job;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        panic!("Transfer timed out");
    }
    async fn stop(&self) {
        self.service.shutdown().await.unwrap();
        self.process.stop().await.unwrap();
    }
}

#[tokio::test]
#[ignore = "requires bundled aria2"]
async fn browser_handoff_downloads_once_and_preserves_file_checksum() {
    let server = Server::start().await;
    let h = Harness::new().await;
    h.service
        .update_settings(dm_domain::Settings {
            default_directory: h.dir.path().to_string_lossy().into(),
            ..Default::default()
        })
        .await
        .unwrap();
    let browser = BrowserService::new(h.service.clone(), h.db.clone());
    let request = |command| BrowserRequest {
        version: 1,
        request_id: "b1111111-1111-4111-8111-111111111111".into(),
        command,
    };
    let prepared = browser
        .handle(request(BrowserOperation::Prepare {
            url: format!("{}/redirect", server.url),
            filename: None,
            evidence: Some(BrowserFileEvidence {
                method: "GET".into(),
                total_bytes: server.data.len() as u64,
                content_type: "application/octet-stream".into(),
                etag: Some("\"version-1\"".into()),
                last_modified: None,
            }),
        }))
        .await;
    assert!(matches!(prepared.state, BrowserState::Prepared));
    assert!(h.service.list().await.unwrap().is_empty());
    let committed = browser.handle(request(BrowserOperation::Commit)).await;
    assert!(matches!(committed.state, BrowserState::Committed));
    let id = committed.job.unwrap().id;
    assert_eq!(
        browser
            .handle(request(BrowserOperation::Commit))
            .await
            .job
            .unwrap()
            .id,
        id
    );
    let complete = h.finish(&id).await;
    assert_eq!(
        complete.status,
        JobStatus::Completed,
        "{:?}",
        complete.error
    );
    let bytes = tokio::fs::read(complete.final_path.unwrap()).await.unwrap();
    assert_eq!(
        Sha256::digest(&bytes),
        Sha256::digest(server.data.as_slice())
    );
    assert_eq!(h.service.list().await.unwrap().len(), 1);
    h.stop().await;
}

#[tokio::test]
#[ignore = "requires bundled aria2"]
async fn parallel_download_checks_hash_and_preserves_existing_files() {
    let server = Server::start().await;
    let h = Harness::new().await;
    tokio::fs::write(h.dir.path().join("sample.bin"), b"existing")
        .await
        .unwrap();
    let checksum = format!("{:x}", Sha256::digest(server.data.as_slice()));
    let job = h
        .add(format!("{}/redirect", server.url), Some(checksum))
        .await;
    let done = h.finish(&job.id).await;
    assert_eq!(done.status, JobStatus::Completed, "{:?}", done.error);
    assert!(
        server.ranges.load(Ordering::SeqCst) > 2,
        "Expected multiple range requests"
    );
    assert_eq!(
        tokio::fs::read(done.final_path.unwrap()).await.unwrap(),
        *server.data
    );
    assert_eq!(
        tokio::fs::read(h.dir.path().join("sample.bin"))
            .await
            .unwrap(),
        b"existing"
    );
    h.stop().await;
}

#[tokio::test]
#[ignore = "requires bundled aria2"]
async fn sequential_and_unknown_length_downloads_complete() {
    let server = Server::start().await;
    let h = Harness::new().await;
    for endpoint in ["sequential", "unknown"] {
        let job = h.add(format!("{}/{endpoint}", server.url), None).await;
        let done = h.finish(&job.id).await;
        assert_eq!(
            done.status,
            JobStatus::Completed,
            "{endpoint}: {:?}",
            done.error
        );
        assert_eq!(
            tokio::fs::read(done.final_path.unwrap()).await.unwrap(),
            *server.data
        );
    }
    h.stop().await;
}

#[tokio::test]
#[ignore = "requires bundled aria2"]
async fn pause_resume_revalidates_and_restart_is_explicit() {
    let server = Server::start().await;
    let h = Harness::new().await;
    let mut settings = h.service.get_settings().await.unwrap();
    settings.speed_limit_bytes = 256 * 1024;
    h.service.update_settings(settings.clone()).await.unwrap();
    let job = h.add(format!("{}/file", server.url), None).await;
    tokio::time::sleep(Duration::from_millis(800)).await;
    h.service.pause(&job.id).await.unwrap();
    assert_eq!(h.service.list().await.unwrap()[0].status, JobStatus::Paused);
    server.version.store(2, Ordering::SeqCst);
    assert_eq!(
        h.service.resume(&job.id, false).await.unwrap_err().code,
        ErrorCode::RestartRequired
    );
    settings.speed_limit_bytes = 0;
    h.service.update_settings(settings).await.unwrap();
    h.service.resume(&job.id, true).await.unwrap();
    assert_eq!(h.finish(&job.id).await.status, JobStatus::Completed);
    h.stop().await;
}

#[tokio::test]
#[ignore = "requires bundled aria2"]
async fn invalid_checksum_is_never_published_and_rpc_requires_secret() {
    let server = Server::start().await;
    let h = Harness::new().await;
    let response = reqwest::Client::new().post(&h.process.endpoint).json(&serde_json::json!({"jsonrpc":"2.0","id":"test","method":"aria2.getVersion","params":[]})).send().await.unwrap().json::<serde_json::Value>().await.unwrap();
    assert!(response.get("error").is_some());
    let job = h
        .add(format!("{}/file", server.url), Some("0".repeat(64)))
        .await;
    let done = h.finish(&job.id).await;
    assert_eq!(done.error.unwrap().code, ErrorCode::ChecksumMismatch);
    assert!(!h.dir.path().join("sample.bin").exists());
    let expired = h
        .service
        .add(AddDownloadRequest {
            url: format!("{}/expired", server.url),
            destination: h.dir.path().to_str().unwrap().into(),
            filename: None,
            expected_sha256: None,
        })
        .await
        .unwrap_err();
    assert_eq!(expired.code, ErrorCode::ExpiredLink);
    h.stop().await;
}

#[tokio::test]
#[ignore = "requires bundled aria2"]
async fn restart_recovers_partial_data_without_duplicate_jobs() {
    let server = Server::start().await;
    let h = Harness::new().await;
    let mut settings = h.service.get_settings().await.unwrap();
    settings.speed_limit_bytes = 1024 * 1024;
    h.service.update_settings(settings).await.unwrap();
    let job = h.add(format!("{}/file", server.url), None).await;
    tokio::time::sleep(Duration::from_millis(1300)).await;
    h.service.tick().await.unwrap();
    // Kill the engine while the persisted job is still active, mimicking an unexpected exit.
    h.engine.shutdown().await.unwrap();
    h.process.stop().await.unwrap();
    let binary = PathBuf::from(std::env::var("ARIA2_BIN").unwrap());
    let process = Aria2Process::start(&binary, h.dir.path()).unwrap();
    let engine =
        Arc::new(Aria2Engine::new(process.endpoint.clone(), process.secret.clone()).unwrap());
    engine.wait_ready().await.unwrap();
    let db = Arc::new(SqliteService::open(&h.dir.path().join("jobs.sqlite")).unwrap());
    let mut settings = db.load_settings().await.unwrap();
    settings.speed_limit_bytes = 0;
    db.save_settings(&settings).await.unwrap();
    let recovered = DownloadService::new(
        engine,
        Arc::new(HttpSourceProbe::new().unwrap()),
        db.clone(),
        db,
        Arc::new(LocalFileStore),
    );
    recovered.recover().await.unwrap();
    assert_eq!(recovered.list().await.unwrap().len(), 1);
    assert_eq!(recovered.list().await.unwrap()[0].status, JobStatus::Paused);
    recovered.resume(&job.id, false).await.unwrap();
    for _ in 0..100 {
        recovered.tick().await.unwrap();
        if recovered.list().await.unwrap()[0].status == JobStatus::Completed {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    let done = recovered.list().await.unwrap().remove(0);
    assert_eq!(done.status, JobStatus::Completed, "{:?}", done.error);
    assert_eq!(
        tokio::fs::read(done.final_path.unwrap()).await.unwrap(),
        *server.data
    );
    recovered.shutdown().await.unwrap();
    process.stop().await.unwrap();
}
