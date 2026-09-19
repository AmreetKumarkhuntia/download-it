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
