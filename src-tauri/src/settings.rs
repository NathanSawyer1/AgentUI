use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusLineItemSetting {
    pub id: String,
    pub enabled: bool,
}

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
    #[serde(rename = "statusLineEnabled", default = "default_status_line_enabled")]
    pub status_line_enabled: bool,
    #[serde(
        rename = "statusLineTemplate",
        default = "default_status_line_template"
    )]
    pub status_line_template: String,
    #[serde(rename = "statusLineItems", default = "default_status_line_items")]
    pub status_line_items: Vec<StatusLineItemSetting>,
}

fn default_status_line_enabled() -> bool {
    true
}

fn default_status_line_template() -> String {
    "{session} | {gateway} {latency} | {time}".into()
}

fn default_status_line_items() -> Vec<StatusLineItemSetting> {
    [
        ("session", true),
        ("gateway", true),
        ("latency", true),
        ("cwd", true),
        ("gitBranch", true),
        ("gitChanges", true),
        ("time", true),
        ("mock", false),
        ("repo", false),
        ("gitWorktree", false),
        ("gitHead", false),
        ("sessionId", false),
        ("split", false),
        ("contextWindow", false),
        ("tokensInput", false),
        ("tokensOutput", false),
        ("tokensTotal", false),
        ("fiveHourLimit", false),
        ("weeklyLimit", false),
    ]
    .into_iter()
    .map(|(id, enabled)| StatusLineItemSetting {
        id: id.into(),
        enabled,
    })
    .collect()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            openclaw_path: String::new(),
            theme: "dark".into(),
            accent: "blue".into(),
            font: "jetbrains".into(),
            font_size: 12,
            use_mock: std::env::var("OPENCLAW_MOCK")
                .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
                .unwrap_or(false),
            status_line_enabled: default_status_line_enabled(),
            status_line_template: default_status_line_template(),
            status_line_items: default_status_line_items(),
        }
    }
}

pub struct SettingsStore {
    path: PathBuf,
    value: Mutex<AppSettings>,
}

impl SettingsStore {
    pub fn new(app: &AppHandle) -> Self {
        let dir = app
            .path()
            .app_config_dir()
            .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default());
        let path = dir.join("settings.json");
        let value = fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        Self {
            path,
            value: Mutex::new(value),
        }
    }

    #[cfg(test)]
    pub fn from_path(path: PathBuf) -> Self {
        let value = fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        Self {
            path,
            value: Mutex::new(value),
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_settings_path(name: &str) -> PathBuf {
        let unique = format!(
            "agentui-{name}-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        std::env::temp_dir().join(unique)
    }

    #[test]
    fn persists_settings_and_loads_them_back() {
        let path = temp_settings_path("settings");
        let store = SettingsStore::from_path(path.clone());
        let mut settings = AppSettings::default();
        settings.openclaw_path = "/opt/openclaw/bin/openclaw".into();
        settings.use_mock = true;
        settings.font_size = 14;

        store.set(settings.clone()).unwrap();
        let loaded = SettingsStore::from_path(path.clone()).get();

        assert_eq!(loaded.openclaw_path, "/opt/openclaw/bin/openclaw");
        assert!(loaded.use_mock);
        assert_eq!(loaded.font_size, 14);

        let _ = fs::remove_file(path);
    }
}
