use crate::{
    openclaw::{cli::CliOpenclawAdapter, mock::MockOpenclawAdapter, ChatEvent, GatewayStatus, OpenclawAdapter},
    settings::{AppSettings, SettingsStore},
};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

pub struct AppState {
    pub settings: Arc<SettingsStore>,
    pub cli: Arc<CliOpenclawAdapter>,
    pub mock: Arc<MockOpenclawAdapter>,
}

impl AppState {
    fn adapter(&self) -> Arc<dyn OpenclawAdapter> {
        let settings = self.settings.get();
        let env_mock = std::env::var("OPENCLAW_MOCK").map(|v| v == "1" || v.eq_ignore_ascii_case("true")).unwrap_or(false);
        if env_mock || settings.use_mock {
            self.mock.clone()
        } else {
            self.cli.clone()
        }
    }
}

#[tauri::command]
pub fn gateway_status(state: State<AppState>) -> Result<GatewayStatus, String> {
    state.adapter().gateway_status().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn chat_send(app: AppHandle, state: State<AppState>, session_id: String, text: String) -> Result<(), String> {
    let sink = Arc::new(move |event: ChatEvent| {
        let _ = app.emit("openclaw:chat", event);
    });
    state.adapter().chat(&session_id, &text, sink).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn chat_cancel(state: State<AppState>, session_id: String) -> Result<(), String> {
    state.adapter().chat_cancel(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn settings_get(state: State<AppState>) -> AppSettings {
    state.settings.get()
}

#[tauri::command]
pub fn settings_set(state: State<AppState>, patch: AppSettings) -> Result<(), String> {
    state.settings.set(patch)
}
