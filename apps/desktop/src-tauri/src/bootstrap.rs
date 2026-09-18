use dm_application::{
    ports::{ProcessSupervisor, SettingsRepository},
    services::DownloadService,
};
use dm_aria2::{Aria2Engine, HttpSourceProbe};
use dm_domain::{AppError, ErrorCode, Result};
use dm_filesystem::LocalFileStore;
use dm_process::Aria2Process;
use dm_sqlite::SqliteService;
use std::{path::PathBuf, sync::Arc};
use tauri::Manager;

pub struct AppServices {
    pub downloads: Arc<DownloadService>,
    pub process: Arc<dyn ProcessSupervisor>,
}

pub async fn initialize(app: &tauri::AppHandle) -> Result<AppServices> {
    let directory = app.path().app_data_dir().map_err(|_| {
        AppError::new(
            ErrorCode::Permission,
            "Cannot locate the application data directory.",
        )
    })?;
    std::fs::create_dir_all(&directory).map_err(|_| {
        AppError::new(
            ErrorCode::Permission,
            "Cannot create the application data directory.",
        )
    })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700)).map_err(
            |_| {
                AppError::new(
                    ErrorCode::Permission,
                    "Cannot protect the application data directory.",
                )
            },
        )?;
    }
    let db = Arc::new(SqliteService::open(&directory.join("downloads.sqlite"))?);
    let mut settings = db.load_settings().await?;
    if settings.default_directory.is_empty() {
        settings.default_directory = app
            .path()
            .download_dir()
            .unwrap_or_else(|_| directory.clone())
            .to_string_lossy()
            .into_owned();
        db.save_settings(&settings).await?;
    }
    let mut libraries = app
        .path()
        .resource_dir()
        .unwrap_or_default()
        .join("aria2-libs");
    #[cfg(debug_assertions)]
    {
        let local = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries/aria2-libs");
        if local.is_dir() {
            libraries = local;
        }
    }
    let process = Arc::new(Aria2Process::start_with_libraries(
        &binary_path()?,
        &directory,
        Some(&libraries),
    )?);
    let engine = Arc::new(Aria2Engine::new(
        process.endpoint.clone(),
        process.secret.clone(),
    )?);
    engine.wait_ready().await?;
    let downloads = Arc::new(DownloadService::new(
        engine,
        Arc::new(HttpSourceProbe::new()?),
        db.clone(),
        db,
        Arc::new(LocalFileStore),
    ));
    downloads.recover().await?;
    Ok(AppServices { downloads, process })
}

fn binary_path() -> Result<PathBuf> {
    let executable = std::env::current_exe().map_err(|_| {
        AppError::new(
            ErrorCode::Engine,
            "Cannot locate the application executable.",
        )
    })?;
    let name = if cfg!(windows) {
        "aria2c.exe"
    } else {
        "aria2c"
    };
    let bundled = executable.parent().unwrap().join(name);
    if bundled.is_file() {
        return Ok(bundled);
    }
    #[cfg(debug_assertions)]
    {
        let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries");
        if let Ok(entries) = std::fs::read_dir(directory) {
            for entry in entries.flatten() {
                if entry.file_name().to_string_lossy().starts_with("aria2c-") {
                    return Ok(entry.path());
                }
            }
        }
    }
    Err(AppError::new(ErrorCode::Engine, "The bundled aria2 executable is missing. Run pnpm prepare:aria2 or reinstall the application."))
}
