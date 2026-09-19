use async_trait::async_trait;
use dm_application::{
    ports::*,
    services::{BrowserService, DownloadService},
};
use dm_contracts::{BrowserOperation, BrowserRequest, BrowserResponse, BrowserState};
use dm_domain::*;
use dm_sqlite::SqliteService;
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
};

#[derive(Default)]
struct Engine {
    enqueues: AtomicUsize,
    fail: AtomicUsize,
}
#[async_trait]
impl DownloadEngine for Engine {
    async fn enqueue(&self, _: &Job, _: &Settings) -> Result<()> {
        self.enqueues.fetch_add(1, Ordering::SeqCst);
        if self.fail.load(Ordering::SeqCst) > 0 {
            Err(AppError::new(ErrorCode::Engine, "Engine unavailable"))
        } else {
            Ok(())
        }
    }
    async fn pause(&self, _: &str) -> Result<()> {
        Ok(())
    }
    async fn remove(&self, _: &str) -> Result<()> {
        if self.fail.load(Ordering::SeqCst) > 1 {
            Err(AppError::new(ErrorCode::Engine, "Removal unconfirmed"))
        } else {
            Ok(())
        }
    }
    async fn inspect(&self, _: &str) -> Result<Option<EngineProgress>> {
        Ok(None)
    }
    async fn configure(&self, _: &Settings) -> Result<()> {
        Ok(())
    }
    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }
}
struct Probe;
#[async_trait]
impl SourceProbe for Probe {
    async fn probe(&self, _: &str) -> Result<SourceMetadata> {
        Ok(SourceMetadata {
            total_bytes: Some(10),
            etag: Some("\"v1\"".into()),
            content_type: Some("application/octet-stream".into()),
            ..Default::default()
        })
    }
}
struct Files;
#[async_trait]
impl FileStore for Files {
    async fn stage(&self, destination: &str, id: &str) -> Result<PathBuf> {
        Ok(Path::new(destination).join(id))
    }
    async fn verify(&self, _: &Path, _: Option<&str>, _: Option<u64>) -> Result<()> {
        Ok(())
    }
    async fn finalize(&self, _: &Path, _: &Path) -> Result<()> {
        Ok(())
    }
    async fn cleanup(&self, _: &Path) -> Result<()> {
        Ok(())
    }
    async fn exists(&self, _: &Path) -> bool {
        false
    }
}
struct Fixture {
    _directory: tempfile::TempDir,
    db: Arc<SqliteService>,
    downloads: Arc<DownloadService>,
    browser: BrowserService,
    engine: Arc<Engine>,
}
async fn fixture() -> Fixture {
    let directory = tempfile::tempdir().unwrap();
    let db = Arc::new(SqliteService::open(&directory.path().join("test.sqlite")).unwrap());
    db.save_settings(&Settings {
        default_directory: directory.path().to_string_lossy().into(),
        ..Default::default()
    })
    .await
    .unwrap();
    let engine = Arc::new(Engine::default());
    let downloads = Arc::new(DownloadService::new(
        engine.clone(),
        Arc::new(Probe),
        db.clone(),
        db.clone(),
        Arc::new(Files),
    ));
    let browser = BrowserService::new(downloads.clone(), db.clone());
    Fixture {
        _directory: directory,
        db,
        downloads,
        browser,
        engine,
    }
}
fn prepare() -> BrowserOperation {
    BrowserOperation::Prepare {
        url: "https://example.com/file".into(),
        filename: None,
        evidence: None,
    }
}

async fn call(service: &BrowserService, operation: BrowserOperation) -> BrowserResponse {
    service
        .handle(BrowserRequest {
            version: 1,
            request_id: "a1111111-1111-4111-8111-111111111111".into(),
            command: operation,
        })
        .await
}

#[tokio::test]
async fn prepare_does_not_start_a_job_and_repeated_commit_is_idempotent() {
    let f = fixture().await;
    assert!(matches!(
        call(&f.browser, prepare()).await.state,
        BrowserState::Prepared
    ));
    assert!(f.db.list().await.unwrap().is_empty());
    assert_eq!(f.engine.enqueues.load(Ordering::SeqCst), 0);
    let accepted = call(&f.browser, BrowserOperation::Commit).await;
    assert!(matches!(accepted.state, BrowserState::Committed));
    let duplicate = call(&f.browser, BrowserOperation::Commit).await;
    assert_eq!(accepted.job.unwrap().id, duplicate.job.unwrap().id);
    assert_eq!(f.engine.enqueues.load(Ordering::SeqCst), 1);
    assert_eq!(f.db.list().await.unwrap().len(), 1);
}
#[tokio::test]
async fn failed_enqueue_is_not_acknowledged_as_accepted() {
    let f = fixture().await;
    f.engine.fail.store(1, Ordering::SeqCst);
    call(&f.browser, prepare()).await;
    let response = call(&f.browser, BrowserOperation::Commit).await;
    assert!(matches!(response.state, BrowserState::Failed));
    assert_eq!(response.job.unwrap().status, JobStatus::Failed);
    assert!(matches!(
        call(&f.browser, BrowserOperation::Status).await.state,
        BrowserState::Failed
    ));
}
#[tokio::test]
async fn uncertain_engine_acceptance_stays_owned_until_restart_recovers_it() {
    let f = fixture().await;
    f.engine.fail.store(2, Ordering::SeqCst);
    call(&f.browser, prepare()).await;
    assert!(matches!(
        call(&f.browser, BrowserOperation::Commit).await.state,
        BrowserState::Committing
    ));
    f.downloads.recover().await.unwrap();
    f.db.recover_handoffs().await.unwrap();
    let response = call(&f.browser, BrowserOperation::Status).await;
    assert!(matches!(response.state, BrowserState::Committed));
    assert_eq!(response.job.unwrap().status, JobStatus::Paused);
}
#[tokio::test]
async fn abort_and_expiry_prevent_late_commits() {
    let f = fixture().await;
    call(&f.browser, prepare()).await;
    let mut h =
        f.db.handoff("a1111111-1111-4111-8111-111111111111")
            .await
            .unwrap()
            .unwrap();
    h.expires_at = 0;
    f.db.save_handoff(&h).await.unwrap();
    assert!(matches!(
        call(&f.browser, BrowserOperation::Commit).await.state,
        BrowserState::Aborted
    ));
    assert!(f.db.list().await.unwrap().is_empty());
    assert_eq!(f.engine.enqueues.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn recovery_does_not_accept_a_job_rejected_before_the_crash() {
    let f = fixture().await;
    call(&f.browser, prepare()).await;
    let mut h =
        f.db.handoff("a1111111-1111-4111-8111-111111111111")
            .await
            .unwrap()
            .unwrap();
    h.state = HandoffState::Committing;
    f.db.commit_handoff(&h).await.unwrap();
    h.job.status = JobStatus::Failed;
    h.job.error = Some(AppError::new(ErrorCode::Engine, "Rejected before crash"));
    f.db.save(&h.job).await.unwrap();
    f.downloads.recover().await.unwrap();
    f.db.recover_handoffs().await.unwrap();
    let response = call(&f.browser, BrowserOperation::Status).await;
    assert!(matches!(response.state, BrowserState::Failed));
    assert_eq!(response.job.unwrap().status, JobStatus::Failed);
}
#[tokio::test]
async fn protocol_rejection_and_shutdown_do_not_mutate_downloads() {
    let f = fixture().await;
    let response = f
        .browser
        .handle(BrowserRequest {
            version: 2,
            request_id: "invalid".into(),
            command: prepare(),
        })
        .await;
    assert!(matches!(response.state, BrowserState::Error));
    f.browser.stop();
    assert!(matches!(
        call(&f.browser, prepare()).await.state,
        BrowserState::Error
    ));
    assert!(f.db.list().await.unwrap().is_empty());
}
#[tokio::test]
async fn migration_preserves_v1_jobs_and_settings() {
    let f = fixture().await;
    call(&f.browser, prepare()).await;
    let handoff =
        f.db.handoff("a1111111-1111-4111-8111-111111111111")
            .await
            .unwrap()
            .unwrap();
    let mut old_job = serde_json::to_value(&handoff.job).unwrap();
    old_job["metadata"]
        .as_object_mut()
        .unwrap()
        .remove("content_type");
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("old.sqlite");
    let connection = rusqlite::Connection::open(&path).unwrap();
    connection
        .execute_batch(include_str!("../migrations/001_initial.sql"))
        .unwrap();
    let settings = Settings {
        max_active_downloads: 7,
        ..Default::default()
    };
    connection
        .execute(
            "INSERT INTO settings(id,payload) VALUES(1,?1)",
            [serde_json::to_string(&settings).unwrap()],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO jobs(id,created_at,payload) VALUES (?1,?2,?3)",
            (
                &handoff.job.id,
                &handoff.job.created_at,
                old_job.to_string(),
            ),
        )
        .unwrap();
    drop(connection);
    let db = SqliteService::open(&path).unwrap();
    assert_eq!(db.load_settings().await.unwrap().max_active_downloads, 7);
    assert!(db.handoff("missing").await.unwrap().is_none());
    let jobs = db.list().await.unwrap();
    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0].id, handoff.job.id);
    assert_eq!(jobs[0].url, handoff.job.url);
    assert!(jobs[0].metadata.content_type.is_none());
    drop(db);
    assert!(SqliteService::open(&path).is_ok());
}
