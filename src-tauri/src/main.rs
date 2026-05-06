mod commands;
mod openclaw;
mod settings;

use commands::{
    agent_capabilities, agents_list, chat_cancel, chat_send, close_session_popouts, diff_files,
    diff_patch, doctor_status, gateway_status, logs_stop, logs_tail, models_list, plugin_install,
    plugin_set_enabled, plugin_uninstall, plugin_uninstall_preview, plugin_update, plugins_list,
    plugins_search, session_create, session_history, session_popout, sessions_list, settings_get,
    settings_set, skill_set_enabled, skills_list, slash_commands_list, stop_all_processes, terminal_cancel,
    terminal_run, window_close, window_minimize, window_start_dragging, window_toggle_maximize,
    workspace_status, AppState,
};
use openclaw::{cli::CliOpenclawAdapter, mock::MockOpenclawAdapter};
use settings::SettingsStore;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let settings = Arc::new(SettingsStore::new(&app.handle()));
            app.manage(AppState {
                cli: Arc::new(CliOpenclawAdapter::new(settings.clone())),
                mock: Arc::new(MockOpenclawAdapter::new()),
                process_runs: Arc::new(Mutex::new(HashMap::new())),
                run_counter: Default::default(),
                settings,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            gateway_status,
            doctor_status,
            workspace_status,
            chat_send,
            chat_cancel,
            models_list,
            agents_list,
            skills_list,
            skill_set_enabled,
            plugins_list,
            plugin_set_enabled,
            plugins_search,
            plugin_install,
            plugin_update,
            plugin_uninstall_preview,
            plugin_uninstall,
            sessions_list,
            session_create,
            session_history,
            agent_capabilities,
            diff_files,
            diff_patch,
            terminal_run,
            terminal_cancel,
            logs_tail,
            logs_stop,
            slash_commands_list,
            session_popout,
            window_start_dragging,
            window_minimize,
            window_toggle_maximize,
            window_close,
            settings_get,
            settings_set
        ])
        .on_window_event(|window, event| {
            if window.label() == "main"
                && matches!(event, tauri::WindowEvent::CloseRequested { .. })
            {
                close_session_popouts(window.app_handle());
                let state = window.app_handle().state::<AppState>();
                stop_all_processes(&state.process_runs);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running AgentUI");
}
