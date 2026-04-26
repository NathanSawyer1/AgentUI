use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(rename = "openclawPath")]
    pub openclaw_path: String,
    pub theme: String,
    pub accent: String,
    pub font: String,
    #[serde(rename = "fontSize")]
    pub font_size: u8,
    #[serde(rename = "useMock")]
    pub use_mock: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            openclaw_path: String::new(),
            theme: "dark".into(),
            accent: "blue".into(),
            font: "jetbrains".into(),
            font_size: 12,
            use_mock: std::env::var("OPENCLAW_MOCK").map(|v| v == "1" || v.eq_ignore_ascii_case("true")).unwrap_or(false),
        }
    }
}

pub struct SettingsStore {
    path: PathBuf,
    value: Mutex<AppSettings>,
}

impl SettingsStore {
    pub fn new(app: &AppHandle) -> Self {
        let dir = app.path().app_config_dir().unwrap_or_else(|_| std::env::current_dir().unwrap_or_default());
        let path = dir.join("settings.json");
        let value = fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        Self { path, value: Mutex::new(value) }
    }

    pub fn get(&self) -> AppSettings {
        self.value.lock().expect("settings mutex poisoned").clone()
    }

    pub fn set(&self, patch: AppSettings) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let bytes = serde_json::to_vec_pretty(&patch).map_err(|e| e.to_string())?;
        fs::write(&self.path, bytes).map_err(|e| e.to_string())?;
        *self.value.lock().expect("settings mutex poisoned") = patch;
        Ok(())
    }
}
