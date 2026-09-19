use super::{database_error, SqliteService};
use async_trait::async_trait;
use dm_application::ports::DiagnosticRepository;
use dm_domain::{DiagnosticEvent, Result};
use rusqlite::Connection;

pub(super) fn write_event(c: &Connection, event: &DiagnosticEvent) -> Result<()> {
    c.execute(
        "INSERT INTO diagnostics(job_id,payload) VALUES (?1,?2)",
        (
            &event.job_id,
            serde_json::to_string(event).map_err(database_error)?,
        ),
    )
    .map_err(database_error)?;
    c.execute(
        "DELETE FROM diagnostics WHERE sequence <= (SELECT MAX(sequence) - 1000 FROM diagnostics)",
        [],
    )
    .map_err(database_error)?;
    Ok(())
}

#[async_trait]
impl DiagnosticRepository for SqliteService {
    async fn record(&self, event: DiagnosticEvent) -> Result<()> {
        self.run(move |c| {
            let tx = c.transaction().map_err(database_error)?;
            write_event(&tx, &event)?;
            tx.commit().map_err(database_error)
        })
        .await
    }

    async fn diagnostics(&self, job_id: Option<&str>) -> Result<Vec<DiagnosticEvent>> {
        let job_id = job_id.map(str::to_owned);
        self.run(move |c| {
            let mut stmt = c.prepare("SELECT payload FROM diagnostics WHERE (?1 IS NULL OR job_id=?1) ORDER BY sequence DESC LIMIT 500").map_err(database_error)?;
            let rows = stmt.query_map([job_id], |r| r.get::<_, String>(0)).map_err(database_error)?;
            rows.map(|r| serde_json::from_str(&r.map_err(database_error)?).map_err(database_error)).collect()
        }).await
    }
}
