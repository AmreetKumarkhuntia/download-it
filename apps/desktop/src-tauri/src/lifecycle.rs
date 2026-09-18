use crate::bootstrap::AppServices;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};
use tauri::{Emitter, Manager};

pub fn poll(app: tauri::AppHandle, stopping: Arc<AtomicBool>) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(800));
        while !stopping.load(Ordering::SeqCst) {
            interval.tick().await;
            let state = app.state::<AppServices>();
            if let Err(error) = state.downloads.tick().await {
                let _ = app.emit("engine-error", error);
            }
            if let Ok(jobs) = state.downloads.list().await {
                let _ = app.emit("downloads-changed", jobs);
            }
        }
    });
}

pub fn exit(app: &tauri::AppHandle, api: &tauri::ExitRequestApi, stopping: Arc<AtomicBool>) {
    api.prevent_exit();
    if stopping.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppServices>();
        let _ = state.downloads.shutdown().await;
        let _ = state.process.stop().await;
        app.exit(0);
    });
}
