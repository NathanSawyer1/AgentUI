mod commands;
mod openclaw;
mod settings;

use commands::{chat_cancel, chat_send, gateway_status, settings_get, settings_set, AppState};
use openclaw::{cli::CliOpenclawAdapter, mock::MockOpenclawAdapter};
use settings::SettingsStore;
use std::sync::Arc;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            let settings = Arc::new(SettingsStore::new(&app.handle()));
            app.manage(AppState {
                cli: Arc::new(CliOpenclawAdapter::new(settings.clone())),
                mock: Arc::new(MockOpenclawAdapter::new()),
                settings,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            gateway_status,
            chat_send,
            chat_cancel,
            settings_get,
            settings_set
        ])
        .run(tauri::generate_context!())
        .expect("error while running AgentUI");
}
