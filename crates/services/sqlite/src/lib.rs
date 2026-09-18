use async_trait::async_trait;
use dm_application::ports::{JobRepository, SettingsRepository};
use dm_domain::{AppError, ErrorCode, Job, Result, Settings};
use rusqlite::{Connection, OptionalExtension};
use std::{path::Path, sync::mpsc};
use tokio::sync::oneshot;

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
        if version > 1 {
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
impl JobRepository for SqliteService {
    async fn save(&self, job: &Job) -> Result<()> {
        let job = job.clone();
        self.run(move |c| {
            let payload = serde_json::to_string(&job).map_err(database_error)?;
            c.execute("INSERT INTO jobs(id,created_at,payload) VALUES (?1,?2,?3) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload", (&job.id, &job.created_at, payload)).map_err(database_error)?;
            Ok(())
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
mod tests {
    use super::*;
    #[tokio::test]
    async fn settings_survive_reopening_and_migrations_are_repeatable() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("jobs.sqlite");
        let db = SqliteService::open(&path).unwrap();
        let settings = Settings {
            max_active_downloads: 7,
            ..Settings::default()
        };
        db.save_settings(&settings).await.unwrap();
        let reopened = SqliteService::open(&path).unwrap();
        assert_eq!(
            reopened.load_settings().await.unwrap().max_active_downloads,
            7
        );
    }
}
