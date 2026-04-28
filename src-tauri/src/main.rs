mod commands;
mod openclaw;
mod settings;

use commands::{agents_list, chat_cancel, chat_send, gateway_status, models_list, session_history, sessions_list, settings_get, settings_set, window_close, window_minimize, window_start_dragging, window_toggle_maximize, AppState};
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
            models_list,
            agents_list,
            sessions_list,
            session_history,
            window_start_dragging,
            window_minimize,
            window_toggle_maximize,
            window_close,
            settings_get,
            settings_set
        ])
        .run(tauri::generate_context!())
        .expect("error while running AgentUI");
}
