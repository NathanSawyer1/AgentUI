use crate::{
    openclaw::{cli::CliOpenclawAdapter, mock::MockOpenclawAdapter, ChatEvent, ChatSendOptions, GatewayStatus, HistoryMessage, OpenclawAdapter, OptionItem, SessionInfo},
    settings::{AppSettings, SettingsStore},
};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

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
pub async fn gateway_status(state: State<'_, AppState>) -> Result<GatewayStatus, String> {
    let adapter = state.adapter();
    tauri::async_runtime::spawn_blocking(move || adapter.gateway_status().map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn chat_send(_app: AppHandle, state: State<'_, AppState>, session_id: String, text: String, options: Option<ChatSendOptions>) -> Result<Vec<ChatEvent>, String> {
    let adapter = state.adapter();
    tauri::async_runtime::spawn_blocking(move || adapter.chat_collect(&session_id, &text, options.unwrap_or_default()).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn chat_cancel(state: State<AppState>, session_id: String) -> Result<(), String> {
    state.adapter().chat_cancel(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn models_list(state: State<'_, AppState>) -> Result<Vec<OptionItem>, String> {
    let adapter = state.adapter();
    tauri::async_runtime::spawn_blocking(move || adapter.models_list().map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn agents_list(state: State<'_, AppState>) -> Result<Vec<OptionItem>, String> {
    let adapter = state.adapter();
    tauri::async_runtime::spawn_blocking(move || adapter.agents_list().map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn sessions_list(state: State<'_, AppState>) -> Result<Vec<SessionInfo>, String> {
    let adapter = state.adapter();
    tauri::async_runtime::spawn_blocking(move || adapter.sessions_list().map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn session_history(state: State<'_, AppState>, session_id: String, limit: Option<usize>) -> Result<Vec<HistoryMessage>, String> {
    let adapter = state.adapter();
    tauri::async_runtime::spawn_blocking(move || adapter.session_history(&session_id, limit.unwrap_or(1000)).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

fn main_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window("main").ok_or_else(|| "main window not found".to_string())
}

#[tauri::command]
pub fn window_start_dragging(app: AppHandle) -> Result<(), String> {
    main_window(&app)?.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_minimize(app: AppHandle) -> Result<(), String> {
    main_window(&app)?.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_toggle_maximize(app: AppHandle) -> Result<(), String> {
    let window = main_window(&app)?;
    if window.is_maximized().map_err(|e| e.to_string())? {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn window_close(app: AppHandle) -> Result<(), String> {
    main_window(&app)?.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn settings_get(state: State<AppState>) -> AppSettings {
    state.settings.get()
}

#[tauri::command]
pub fn settings_set(state: State<AppState>, patch: AppSettings) -> Result<(), String> {
    state.settings.set(patch)
}
