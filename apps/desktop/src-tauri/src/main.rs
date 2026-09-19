#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod bootstrap;
mod commands;
mod lifecycle;

use std::sync::{atomic::AtomicBool, Arc};
use tauri::Manager;

fn main() {
    let stopping = Arc::new(AtomicBool::new(false));
    let polling_stop = stopping.clone();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            let services = tauri::async_runtime::block_on(bootstrap::initialize(app.handle()))?;
            app.manage(services);
            lifecycle::poll(app.handle().clone(), polling_stop);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_downloads,
            commands::add_download,
            commands::pause_download,
            commands::resume_download,
            commands::cancel_download,
            commands::get_settings,
            commands::update_settings,
            commands::get_download_details,
            commands::get_engine_health,
            commands::get_diagnostics
        ])
        .build(tauri::generate_context!())
        .expect(
            "Download It could not start. Verify bundled aria2 and data-directory permissions.",
        );
    app.run(move |handle, event| {
        if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
            if code.is_none() {
                lifecycle::exit(handle, &api, stopping.clone());
            }
        }
    });
}
