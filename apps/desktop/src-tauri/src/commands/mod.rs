use crate::bootstrap::AppServices;
use dm_contracts::{AddDownloadRequest, JobView};
use dm_domain::{Result, Settings};
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
    state.downloads.add(request).await
}
#[tauri::command]
pub async fn pause_download(state: State<'_, AppServices>, id: String) -> Result<()> {
    state.downloads.pause(&id).await
}
#[tauri::command]
pub async fn resume_download(
    state: State<'_, AppServices>,
    id: String,
    restart: bool,
) -> Result<()> {
    state.downloads.resume(&id, restart).await
}
#[tauri::command]
pub async fn cancel_download(state: State<'_, AppServices>, id: String) -> Result<()> {
    state.downloads.cancel(&id).await
}
#[tauri::command]
pub async fn get_settings(state: State<'_, AppServices>) -> Result<Settings> {
    state.downloads.get_settings().await
}
#[tauri::command]
pub async fn update_settings(state: State<'_, AppServices>, settings: Settings) -> Result<()> {
    state.downloads.update_settings(settings).await
}
