use async_trait::async_trait;
use dm_application::ports::{BrowserHandoffRepository, JobRepository, SettingsRepository};
use dm_domain::{AppError, BrowserHandoff, ErrorCode, HandoffState, Job, Result, Settings};
use rusqlite::{Connection, OptionalExtension};
use std::{path::Path, sync::mpsc};
use tokio::sync::oneshot;
mod diagnostics;

type Work = Box<dyn FnOnce(&mut Connection) + Send>;
pub struct SqliteService {
    sender: mpsc::Sender<Work>,
}

fn database_error(_: impl std::fmt::Display) -> AppError {
    AppError::new(
        ErrorCode::Persistence,
        "Could not access the download database. Check available disk space and permissions.",
    )
}

impl SqliteService {
    pub fn open(path: &Path) -> Result<Self> {
        let mut connection = Connection::open(path).map_err(database_error)?;
        connection
            .execute_batch(
                "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;",
            )
            .map_err(database_error)?;
        let version: u32 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(database_error)?;
        if version > 3 {
            return Err(AppError::new(
                ErrorCode::Persistence,
                "This database belongs to a newer application version.",
            ));
        }
        if version == 0 {
            let tx = connection.transaction().map_err(database_error)?;
            tx.execute_batch(include_str!("../migrations/001_initial.sql"))
                .map_err(database_error)?;
            tx.commit().map_err(database_error)?;
        }
        if version < 2 {
            let tx = connection.transaction().map_err(database_error)?;
            tx.execute_batch(include_str!("../migrations/002_browser_handoffs.sql"))
                .map_err(database_error)?;
            tx.commit().map_err(database_error)?;
        }
        if version < 3 {
            let tx = connection.transaction().map_err(database_error)?;
            tx.execute_batch(include_str!("../migrations/003_diagnostics.sql"))
                .map_err(database_error)?;
            tx.commit().map_err(database_error)?;
        }
        let (sender, receiver) = mpsc::channel::<Work>();
        std::thread::Builder::new()
            .name("download-database".into())
            .spawn(move || {
                while let Ok(work) = receiver.recv() {
                    work(&mut connection);
                }
            })
            .map_err(database_error)?;
        Ok(Self { sender })
    }
    async fn run<T: Send + 'static>(
        &self,
        f: impl FnOnce(&mut Connection) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        let (sender, receiver) = oneshot::channel();
        self.sender
            .send(Box::new(move |connection| {
                let _ = sender.send(f(connection));
            }))
            .map_err(database_error)?;
        receiver.await.map_err(database_error)?
    }
}

#[async_trait]
impl BrowserHandoffRepository for SqliteService {
    async fn handoff(&self, request_id: &str) -> Result<Option<BrowserHandoff>> {
        let id = request_id.to_owned();
        self.run(move |c| {
            let raw: Option<String> = c
                .query_row(
                    "SELECT payload FROM browser_handoffs WHERE request_id=?1",
                    [id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(database_error)?;
            raw.map(|s| serde_json::from_str(&s).map_err(database_error))
                .transpose()
        })
        .await
    }

    async fn save_handoff(&self, handoff: &BrowserHandoff) -> Result<()> {
        let handoff = handoff.clone();
        self.run(move |c| {
            let payload = serde_json::to_string(&handoff).map_err(database_error)?;
            c.execute("INSERT INTO browser_handoffs(request_id,payload) VALUES (?1,?2) ON CONFLICT(request_id) DO UPDATE SET payload=excluded.payload", (&handoff.request_id, payload)).map_err(database_error)?;
            Ok(())
        }).await
    }

    async fn commit_handoff(&self, handoff: &BrowserHandoff) -> Result<()> {
        let handoff = handoff.clone();
        self.run(move |c| {
            let tx = c.transaction().map_err(database_error)?;
            let job = &handoff.job;
            tx.execute(
                "INSERT INTO jobs(id,created_at,payload) VALUES (?1,?2,?3)",
                (
                    &job.id,
                    &job.created_at,
                    serde_json::to_string(job).map_err(database_error)?,
                ),
            )
            .map_err(database_error)?;
            tx.execute(
                "UPDATE browser_handoffs SET payload=?2 WHERE request_id=?1",
                (
                    &handoff.request_id,
                    serde_json::to_string(&handoff).map_err(database_error)?,
                ),
            )
            .map_err(database_error)?;
            tx.commit().map_err(database_error)
        })
        .await
    }

    async fn recover_handoffs(&self) -> Result<()> {
        // DownloadService::recover has already paused every durable interrupted job.
        self.run(|c| {
            let records: Vec<String> = c
                .prepare("SELECT payload FROM browser_handoffs")
                .map_err(database_error)?
                .query_map([], |r| r.get(0))
                .map_err(database_error)?
                .collect::<std::result::Result<_, _>>()
                .map_err(database_error)?;
            let tx = c.transaction().map_err(database_error)?;
            for raw in records {
                let mut h: BrowserHandoff = serde_json::from_str(&raw).map_err(database_error)?;
                if h.state == HandoffState::Committing {
                    let job: String = tx
                        .query_row("SELECT payload FROM jobs WHERE id=?1", [&h.job.id], |r| {
                            r.get(0)
                        })
                        .map_err(database_error)?;
                    let job: Job = serde_json::from_str(&job).map_err(database_error)?;
                    // A crash can occur after storing a rejected job but before updating
                    // its handoff. Do not turn that failed enqueue into acceptance.
                    h.state = if matches!(
                        job.status,
                        dm_domain::JobStatus::Failed | dm_domain::JobStatus::Cancelled
                    ) {
                        HandoffState::Failed
                    } else {
                        HandoffState::Committed
                    };
                    tx.execute(
                        "UPDATE browser_handoffs SET payload=?2 WHERE request_id=?1",
                        (
                            &h.request_id,
                            serde_json::to_string(&h).map_err(database_error)?,
                        ),
                    )
                    .map_err(database_error)?;
                }
            }
            tx.commit().map_err(database_error)
        })
        .await
    }
}

#[async_trait]
impl JobRepository for SqliteService {
    async fn save(&self, job: &Job) -> Result<()> {
        let job = job.clone();
        self.run(move |c| {
            let tx = c.transaction().map_err(database_error)?;
            let old: Option<String> = tx.query_row("SELECT payload FROM jobs WHERE id=?1", [&job.id], |r| r.get(0)).optional().map_err(database_error)?;
            let old = old.map(|raw| serde_json::from_str::<Job>(&raw).map_err(database_error)).transpose()?;
            if old.as_ref().is_none_or(|previous| previous.status != job.status || previous.error.as_ref().map(|e| &e.code) != job.error.as_ref().map(|e| &e.code)) {
                diagnostics::write_event(&tx, &dm_domain::DiagnosticEvent {
                    timestamp: dm_domain::timestamp(),
                    level: if job.error.is_some() { "error" } else { "info" }.into(),
                    event: "download.state".into(),
                    job_id: Some(job.id.clone()),
                    message: format!("Status: {:?}; downloaded: {} bytes; connections: {}; speed: {} bytes/s; error: {:?}", job.status, job.downloaded_bytes, job.connections, job.speed_bytes, job.error.as_ref().map(|e| &e.code)),
                })?;
            }
            let payload = serde_json::to_string(&job).map_err(database_error)?;
            tx.execute("INSERT INTO jobs(id,created_at,payload) VALUES (?1,?2,?3) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload", (&job.id, &job.created_at, payload)).map_err(database_error)?;
            tx.commit().map_err(database_error)
        }).await
    }
    async fn list(&self) -> Result<Vec<Job>> {
        self.run(|c| {
            let mut stmt = c
                .prepare("SELECT payload FROM jobs ORDER BY created_at DESC, id DESC")
                .map_err(database_error)?;
            let rows = stmt
                .query_map([], |r| r.get::<_, String>(0))
                .map_err(database_error)?;
            rows.map(|r| serde_json::from_str(&r.map_err(database_error)?).map_err(database_error))
                .collect()
        })
        .await
    }
}

#[async_trait]
impl SettingsRepository for SqliteService {
    async fn load_settings(&self) -> Result<Settings> {
        self.run(|c| {
            let raw: Option<String> = c
                .query_row("SELECT payload FROM settings WHERE id=1", [], |r| r.get(0))
                .optional()
                .map_err(database_error)?;
            raw.map(|s| serde_json::from_str(&s).map_err(database_error))
                .unwrap_or_else(|| Ok(Settings::default()))
        })
        .await
    }
    async fn save_settings(&self, settings: &Settings) -> Result<()> {
        let value = serde_json::to_string(settings).map_err(database_error)?;
        self.run(move |c| {
            c.execute("INSERT INTO settings(id,payload) VALUES (1,?1) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload", [value]).map_err(database_error)?;
            Ok(())
        }).await
    }
}

#[cfg(test)]
#[path = "../../../../tests/rust/sqlite/unit.rs"]
mod tests;
