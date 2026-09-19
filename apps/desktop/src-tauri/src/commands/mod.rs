use crate::bootstrap::AppServices;
use dm_contracts::{AddDownloadRequest, DownloadDetails, JobView};
use dm_domain::{DiagnosticEvent, EngineHealth, Result, Settings};
use tauri::State;

#[tauri::command]
pub async fn list_downloads(state: State<'_, AppServices>) -> Result<Vec<JobView>> {
    state.downloads.list().await
}
#[tauri::command]
pub async fn add_download(
    state: State<'_, AppServices>,
    request: AddDownloadRequest,
) -> Result<JobView> {
    let result = state.downloads.add(request).await;
    record_action(&state, "download.add", None, result).await
}
#[tauri::command]
pub async fn pause_download(state: State<'_, AppServices>, id: String) -> Result<()> {
    let result = state.downloads.pause(&id).await;
    record_action(&state, "download.pause", Some(&id), result).await
}
#[tauri::command]
pub async fn resume_download(
    state: State<'_, AppServices>,
    id: String,
    restart: bool,
) -> Result<()> {
    let result = state.downloads.resume(&id, restart).await;
    record_action(
        &state,
        if restart {
            "download.restart"
        } else {
            "download.resume"
        },
        Some(&id),
        result,
    )
    .await
}
#[tauri::command]
pub async fn cancel_download(state: State<'_, AppServices>, id: String) -> Result<()> {
    let result = state.downloads.cancel(&id).await;
    record_action(&state, "download.cancel", Some(&id), result).await
}
#[tauri::command]
pub async fn get_settings(state: State<'_, AppServices>) -> Result<Settings> {
    state.downloads.get_settings().await
}
#[tauri::command]
pub async fn update_settings(state: State<'_, AppServices>, settings: Settings) -> Result<()> {
    let message = format!("Active download limit: {}; connections per new/resumed download: {}; total speed limit: {} bytes/s (0 = unlimited).", settings.max_active_downloads, settings.connections_per_download, settings.speed_limit_bytes);
    let result = state.downloads.update_settings(settings).await;
    if result.is_ok() {
        state
            .downloads
            .record_event("info", "settings.changed", None, message)
            .await;
    }
    record_action(&state, "settings.update", None, result).await
}

#[tauri::command]
pub async fn get_download_details(
    state: State<'_, AppServices>,
    id: String,
) -> Result<DownloadDetails> {
    state.downloads.details(&id).await
}

#[tauri::command]
pub async fn get_engine_health(state: State<'_, AppServices>) -> Result<EngineHealth> {
    Ok(state.downloads.engine_health().await)
}

#[tauri::command]
pub async fn get_diagnostics(
    state: State<'_, AppServices>,
    job_id: Option<String>,
) -> Result<Vec<DiagnosticEvent>> {
    state.downloads.diagnostics(job_id.as_deref()).await
}

async fn record_action<T>(
    state: &AppServices,
    action: &str,
    id: Option<&str>,
    result: Result<T>,
) -> Result<T> {
    if let Err(error) = &result {
        // Action inputs and arbitrary error text may contain filenames or URLs.
        let id = id.filter(|id| id.len() == 32 && id.bytes().all(|c| c.is_ascii_hexdigit()));
        state
            .downloads
            .record_event(
                "error",
                action,
                id,
                format!("Action failed: {:?}.", error.code),
            )
            .await;
    }
    result
}
