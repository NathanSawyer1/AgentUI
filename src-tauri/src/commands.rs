use crate::{
    openclaw::{
        cli::CliOpenclawAdapter, cli_binary::build_command, mock::MockOpenclawAdapter,
        AgentCapabilities, ChatEvent, ChatSendOptions, DiffFile, DiffPatch, GatewayStatus,
        HistoryMessage, LogsEvent, OpenclawAdapter, OptionItem, PluginActionResult, PluginItem,
        PluginSearchResult, RunId, SessionInfo, SkillItem, SlashCommand, TerminalEvent,
    },
    settings::{AppSettings, SettingsStore},
};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{BufRead, BufReader},
    path::Path,
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex, MutexGuard,
    },
    thread,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub struct AppState {
    pub settings: Arc<SettingsStore>,
    pub cli: Arc<CliOpenclawAdapter>,
    pub mock: Arc<MockOpenclawAdapter>,
    pub process_runs: Arc<Mutex<HashMap<String, Child>>>,
    pub run_counter: AtomicU64,
}

type ProcessRuns = Arc<Mutex<HashMap<String, Child>>>;

#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceStatus {
    pub cwd: String,
    pub repo: Option<String>,
    #[serde(rename = "gitBranch")]
    pub git_branch: Option<String>,
    #[serde(rename = "gitWorktree")]
    pub git_worktree: Option<String>,
    #[serde(rename = "gitChanges")]
    pub git_changes: Option<usize>,
    #[serde(rename = "gitHead")]
    pub git_head: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DoctorCheck {
    pub id: String,
    pub label: String,
    pub status: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DoctorReport {
    #[serde(rename = "appVersion")]
    pub app_version: String,
    pub mode: String,
    #[serde(rename = "binaryPath")]
    pub binary_path: Option<String>,
    #[serde(rename = "tokenPresent")]
    pub token_present: bool,
    pub checks: Vec<DoctorCheck>,
}

impl AppState {
    fn next_run_id(&self, prefix: &str) -> String {
        let counter = self.run_counter.fetch_add(1, Ordering::Relaxed) + 1;
        let millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or(0);
        format!("{prefix}-{millis}-{counter}")
    }
}

fn doctor_check(id: &str, label: &str, status: &str, detail: String) -> DoctorCheck {
    DoctorCheck {
        id: id.into(),
        label: label.into(),
        status: status.into(),
        detail,
    }
}

fn emit_terminal(app: &AppHandle, event: TerminalEvent) {
    let _ = app.emit("agentui:terminal", event);
}

fn emit_logs(app: &AppHandle, event: LogsEvent) {
    let _ = app.emit("agentui:logs", event);
}

fn lock_process_runs(runs: &ProcessRuns) -> Result<MutexGuard<'_, HashMap<String, Child>>, String> {
    runs.lock()
        .map_err(|_| "process runner state is unavailable".to_string())
}

fn insert_process_child(runs: &ProcessRuns, run_id: &str, child: Child) -> Result<(), String> {
    lock_process_runs(runs)?.insert(run_id.to_string(), child);
    Ok(())
}

fn remove_process_child(runs: &ProcessRuns, run_id: &str) -> Result<Option<Child>, String> {
    Ok(lock_process_runs(runs)?.remove(run_id))
}

fn validate_command_cwd(cwd: Option<String>) -> Result<Option<String>, String> {
    let Some(cwd) = cwd.map(|value| value.trim().to_string()).filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };
    let path = Path::new(&cwd);
    if !path.exists() {
        return Err(format!("cwd does not exist: {cwd}"));
    }
    if !path.is_dir() {
        return Err(format!("cwd is not a directory: {cwd}"));
    }
    Ok(Some(cwd))
}

impl AppState {
    fn adapter(&self) -> Arc<dyn OpenclawAdapter> {
        let settings = self.settings.get();
        let env_mock = std::env::var("OPENCLAW_MOCK")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false);
        if env_mock || settings.use_mock {
            self.mock.clone()
        } else {
            self.cli.clone()
        }
    }
}

fn command_text(command: &mut Command) -> Option<String> {
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!text.is_empty()).then_some(text)
}

fn path_name(path: &str) -> Option<String> {
    Path::new(path)
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn workspace_status() -> Result<WorkspaceStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
        let cwd_text = cwd.to_string_lossy().to_string();
        let git_root = command_text(
            Command::new("git")
                .args(["rev-parse", "--show-toplevel"])
                .current_dir(&cwd),
        );
        let git_branch = command_text(
            Command::new("git")
                .args(["branch", "--show-current"])
                .current_dir(&cwd),
        )
        .or_else(|| {
            command_text(
                Command::new("git")
                    .args(["rev-parse", "--abbrev-ref", "HEAD"])
                    .current_dir(&cwd),
            )
        });
        let git_head = command_text(
            Command::new("git")
                .args(["rev-parse", "--short", "HEAD"])
                .current_dir(&cwd),
        );
        let git_changes = git_root.as_ref().map(|_| {
            command_text(
                Command::new("git")
                    .args(["status", "--porcelain"])
                    .current_dir(&cwd),
            )
            .map(|status| {
                status
                    .lines()
                    .filter(|line| !line.trim().is_empty())
                    .count()
            })
            .unwrap_or(0)
        });
        let repo = git_root.as_deref().and_then(path_name);
        let git_worktree = git_root
            .as_deref()
            .and_then(path_name)
            .or_else(|| path_name(&cwd_text));

        Ok(WorkspaceStatus {
            cwd: cwd_text,
            repo,
            git_branch,
            git_worktree,
            git_changes,
            git_head,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn gateway_status(state: State<'_, AppState>) -> Result<GatewayStatus, String> {
    let adapter = state.adapter();
    tauri::async_runtime::spawn_blocking(move || {
        adapter.gateway_status().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn doctor_status(state: State<'_, AppState>) -> Result<DoctorReport, String> {
    let settings_store = Arc::clone(&state.settings);
    let settings = settings_store.get();
    let adapter = state.adapter();
    tauri::async_runtime::spawn_blocking(move || {
        let env_mock = std::env::var("OPENCLAW_MOCK")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false);
        let use_mock = env_mock || settings.use_mock;
        let token_present = std::env::var("OPENCLAW_GATEWAY_TOKEN")
            .map(|token| !token.trim().is_empty())
            .unwrap_or(false);
        let mut checks = Vec::new();
        checks.push(doctor_check(
            "mode",
            "Adapter mode",
            "ok",
            if use_mock {
                "Mock adapter is enabled".into()
            } else {
                "Live OpenClaw adapter is enabled".into()
            },
        ));

        let binary_result = crate::openclaw::cli_binary::binary_path(&settings_store);
        let binary_path = binary_result.as_ref().ok().cloned();
        checks.push(match binary_result {
            Ok(path) => doctor_check("binary", "OpenClaw binary", "ok", path),
            Err(error) if use_mock => doctor_check(
                "binary",
                "OpenClaw binary",
                "warn",
                format!("{error}. Mock mode can still run the UI."),
            ),
            Err(error) => doctor_check("binary", "OpenClaw binary", "err", error.to_string()),
        });

        checks.push(doctor_check(
            "token",
            "Gateway token",
            if token_present { "ok" } else { "warn" },
            if token_present {
                "OPENCLAW_GATEWAY_TOKEN is present".into()
            } else {
                "OPENCLAW_GATEWAY_TOKEN is not set".into()
            },
        ));

        match adapter.gateway_status() {
            Ok(status) => checks.push(doctor_check(
                "gateway",
                "Gateway status",
                if status.status == "online" { "ok" } else { "warn" },
                status
                    .message
                    .unwrap_or_else(|| format!("{} at {}ms", status.status, status.latency_ms)),
            )),
            Err(error) if use_mock => checks.push(doctor_check(
                "gateway",
                "Gateway status",
                "warn",
                format!("{error}. Mock mode is enabled."),
            )),
            Err(error) => checks.push(doctor_check(
                "gateway",
                "Gateway status",
                "err",
                error.to_string(),
            )),
        }

        Ok(DoctorReport {
            app_version: env!("CARGO_PKG_VERSION").into(),
            mode: if use_mock { "mock" } else { "live" }.into(),
            binary_path,
            token_present,
            checks,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn chat_send(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    text: String,
    options: Option<ChatSendOptions>,
) -> Result<(), String> {
    let adapter = state.adapter();
    let sink_app = app.clone();
    let sink = Arc::new(move |event: ChatEvent| {
        let _ = sink_app.emit("openclaw:chat", event);
    });
    tauri::async_runtime::spawn_blocking(move || {
        adapter
            .chat(&session_id, &text, options.unwrap_or_default(), sink)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn chat_cancel(state: State<AppState>, session_id: String) -> Result<(), String> {
    state
        .adapter()
        .chat_cancel(&session_id)
        .map_err(|e| e.to_string())
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
pub async fn skills_list(state: State<'_, AppState>) -> Result<Vec<SkillItem>, String> {
    let adapter = state.adapter();
    tauri::async_runtime::spawn_blocking(move || adapter.skills_list().map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn skill_set_enabled(
    state: State<'_, AppState>,
    name: String,
    enabled: bool,
) -> Result<Vec<SkillItem>, String> {
    let adapter = state.adapter();
    tauri::async_runtime::spawn_blocking(move || {
        adapter
            .skill_set_enabled(&name, enabled)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn plugins_list(state: State<'_, AppState>) -> Result<Vec<PluginItem>, String> {
    let adapter = state.adapter();
    tauri::async_runtime::spawn_blocking(move || adapter.plugins_list().map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn plugin_set_enabled(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> Result<Vec<PluginItem>, String> {
    let adapter = state.adapter();
    tauri::async_runtime::spawn_blocking(move || {
        adapter
            .plugin_set_enabled(&id, enabled)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn plugins_search(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<PluginSearchResult>, String> {
    let adapter = state.adapter();
    tauri::async_runtime::spawn_blocking(move || {
        adapter
            .plugins_search(&query, limit.unwrap_or(8))
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn plugin_install(
    state: State<'_, AppState>,
    spec: String,
) -> Result<PluginActionResult, String> {
    let adapter = state.adapter();
    tauri::async_runtime::spawn_blocking(move || {
        adapter.plugin_install(&spec).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn plugin_update(
    state: State<'_, AppState>,
    id: Option<String>,
) -> Result<PluginActionResult, String> {
    let adapter = state.adapter();
    tauri::async_runtime::spawn_blocking(move || {
        adapter
            .plugin_update(id.as_deref())
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn plugin_uninstall_preview(
    state: State<'_, AppState>,
    id: String,
) -> Result<PluginActionResult, String> {
    let adapter = state.adapter();
    tauri::async_runtime::spawn_blocking(move || {
        adapter
            .plugin_uninstall_preview(&id)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn plugin_uninstall(
    state: State<'_, AppState>,
    id: String,
) -> Result<PluginActionResult, String> {
    let adapter = state.adapter();
    tauri::async_runtime::spawn_blocking(move || {
        adapter.plugin_uninstall(&id).map_err(|e| e.to_string())
    })
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
pub async fn session_create(
    state: State<'_, AppState>,
    agent_id: Option<String>,
) -> Result<SessionInfo, String> {
    let adapter = state.adapter();
    tauri::async_runtime::spawn_blocking(move || {
        adapter
            .session_create(agent_id.as_deref())
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn agent_capabilities(state: State<'_, AppState>) -> Result<AgentCapabilities, String> {
    let adapter = state.adapter();
    tauri::async_runtime::spawn_blocking(move || {
        adapter.agent_capabilities().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn diff_files() -> Result<Vec<DiffFile>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
        let output = Command::new("git")
            .args(["diff", "--numstat"])
            .current_dir(cwd)
            .output()
            .map_err(|e| format!("failed to run `git diff --numstat`: {e}"))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
        Ok(String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter_map(parse_numstat_line)
            .collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn parse_numstat_line(line: &str) -> Option<DiffFile> {
    let mut parts = line.split('\t');
    let adds = parts.next()?;
    let dels = parts.next()?;
    let path = parts.collect::<Vec<_>>().join("\t");
    if path.trim().is_empty() {
        return None;
    }
    let path = normalize_numstat_path(&path);
    Some(DiffFile {
        path,
        adds: adds.parse().unwrap_or(0),
        dels: dels.parse().unwrap_or(0),
    })
}

fn normalize_numstat_path(path: &str) -> String {
    let trimmed = path.trim();
    if let (Some(open), Some(close)) = (trimmed.find('{'), trimmed.rfind('}')) {
        if open < close {
            let prefix = &trimmed[..open];
            let suffix = &trimmed[close + 1..];
            let inner = &trimmed[open + 1..close];
            if let Some((_, new_name)) = inner.split_once(" => ") {
                return format!("{prefix}{new_name}{suffix}");
            }
        }
    }
    if let Some((_, new_path)) = trimmed.rsplit_once(" => ") {
        return new_path.trim_matches(['{', '}']).to_string();
    }
    trimmed.to_string()
}

#[tauri::command]
pub async fn diff_patch(path: String) -> Result<DiffPatch, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
        let output = Command::new("git")
            .args(["diff", "--patch", "--", &path])
            .current_dir(cwd)
            .output()
            .map_err(|e| format!("failed to run `git diff --patch -- {path}`: {e}"))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
        Ok(DiffPatch {
            path,
            patch: String::from_utf8_lossy(&output.stdout).to_string(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn terminal_run(
    app: AppHandle,
    state: State<AppState>,
    command: String,
    cwd: Option<String>,
) -> Result<RunId, String> {
    let command_text = command.trim().to_string();
    if command_text.is_empty() {
        return Err("command is empty".into());
    }
    let run_id = state.next_run_id("term");
    let run_id_for_thread = run_id.clone();
    let runs = Arc::clone(&state.process_runs);
    let app_for_thread = app.clone();
    let cwd_path = validate_command_cwd(cwd)?;
    let mut child_command = Command::new("sh");
    child_command.args(["-lc", &command_text]);
    if let Some(cwd) = cwd_path {
        child_command.current_dir(cwd);
    } else if let Ok(cwd) = std::env::current_dir() {
        child_command.current_dir(cwd);
    }
    child_command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = child_command
        .spawn()
        .map_err(|e| format!("failed to run command: {e}"))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    insert_process_child(&runs, &run_id, child)?;

    thread::spawn(move || {
        let mut readers = Vec::new();
        if let Some(stdout) = stdout {
            let app = app_for_thread.clone();
            let run_id = run_id_for_thread.clone();
            readers.push(thread::spawn(move || {
                for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                    emit_terminal(
                        &app,
                        TerminalEvent {
                            run_id: run_id.clone(),
                            stream: Some("stdout".into()),
                            line: Some(line),
                            exit_code: None,
                            error: None,
                            done: None,
                        },
                    );
                }
            }));
        }
        if let Some(stderr) = stderr {
            let app = app_for_thread.clone();
            let run_id = run_id_for_thread.clone();
            readers.push(thread::spawn(move || {
                for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                    emit_terminal(
                        &app,
                        TerminalEvent {
                            run_id: run_id.clone(),
                            stream: Some("stderr".into()),
                            line: Some(line),
                            exit_code: None,
                            error: None,
                            done: None,
                        },
                    );
                }
            }));
        }
        let (exit_code, error) = match remove_process_child(&runs, &run_id_for_thread) {
            Ok(child) => {
                let status = child.and_then(|mut child| child.wait().ok());
                (status.and_then(|status| status.code()), None)
            }
            Err(error) => (None, Some(error)),
        };
        for reader in readers {
            let _ = reader.join();
        }
        emit_terminal(
            &app_for_thread,
            TerminalEvent {
                run_id: run_id_for_thread,
                stream: None,
                line: None,
                exit_code,
                error,
                done: Some(true),
            },
        );
    });

    Ok(RunId { run_id })
}

#[tauri::command]
pub fn terminal_cancel(state: State<AppState>, run_id: String) -> Result<(), String> {
    if let Some(mut child) = remove_process_child(&state.process_runs, &run_id)? {
        let _ = child.kill();
    }
    Ok(())
}

#[tauri::command]
pub fn logs_tail(
    app: AppHandle,
    state: State<AppState>,
    limit: Option<usize>,
    follow: Option<bool>,
) -> Result<RunId, String> {
    let run_id = state.next_run_id("logs");
    let run_id_for_thread = run_id.clone();
    let runs = Arc::clone(&state.process_runs);
    let app_for_thread = app.clone();
    let limit_text = limit.unwrap_or(200).clamp(1, 5000).to_string();
    let mut command = build_command(&state.settings).map_err(|e| e.to_string())?;
    command.args(["logs", "--json", "--plain", "--limit", &limit_text]);
    if follow.unwrap_or(false) {
        command.arg("--follow");
    }
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|e| format!("failed to run `openclaw logs`: {e}"))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    insert_process_child(&runs, &run_id, child)?;

    thread::spawn(move || {
        let mut readers = Vec::new();
        if let Some(stdout) = stdout {
            let app = app_for_thread.clone();
            let run_id = run_id_for_thread.clone();
            readers.push(thread::spawn(move || {
                for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                    let record = serde_json::from_str::<serde_json::Value>(&line).ok();
                    emit_logs(
                        &app,
                        LogsEvent {
                            run_id: run_id.clone(),
                            line: Some(line),
                            record,
                            error: None,
                            done: None,
                        },
                    );
                }
            }));
        }
        if let Some(stderr) = stderr {
            let app = app_for_thread.clone();
            let run_id = run_id_for_thread.clone();
            readers.push(thread::spawn(move || {
                for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                    emit_logs(
                        &app,
                        LogsEvent {
                            run_id: run_id.clone(),
                            line: None,
                            record: None,
                            error: Some(line),
                            done: None,
                        },
                    );
                }
            }));
        }
        let error = match remove_process_child(&runs, &run_id_for_thread) {
            Ok(child) => {
                let _ = child.map(|mut child| child.wait());
                None
            }
            Err(error) => Some(error),
        };
        for reader in readers {
            let _ = reader.join();
        }
        emit_logs(
            &app_for_thread,
            LogsEvent {
                run_id: run_id_for_thread,
                line: None,
                record: None,
                error,
                done: Some(true),
            },
        );
    });

    Ok(RunId { run_id })
}

#[tauri::command]
pub fn logs_stop(state: State<AppState>, run_id: String) -> Result<(), String> {
    terminal_cancel(state, run_id)
}

#[tauri::command]
pub async fn session_history(
    state: State<'_, AppState>,
    session_id: String,
    limit: Option<usize>,
) -> Result<Vec<HistoryMessage>, String> {
    let adapter = state.adapter();
    tauri::async_runtime::spawn_blocking(move || {
        adapter
            .session_history(&session_id, limit.unwrap_or(1000))
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn slash_commands_list(state: State<'_, AppState>) -> Result<Vec<SlashCommand>, String> {
    let adapter = state.adapter();
    tauri::async_runtime::spawn_blocking(move || {
        adapter.slash_commands_list().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn popout_label(session_id: &str) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in session_id.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("session-popout-{hash:016x}")
}

pub fn close_session_popouts(app: &AppHandle) {
    for (label, window) in app.webview_windows() {
        if label.starts_with("session-popout-") {
            let _ = window.close();
        }
    }
}

fn url_encode(input: &str) -> String {
    let mut encoded = String::new();
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char)
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}

#[tauri::command]
pub fn session_popout(app: AppHandle, session_id: String, title: String) -> Result<(), String> {
    let label = popout_label(&session_id);
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.show();
        return window.set_focus().map_err(|e| e.to_string());
    }

    let url = format!("index.html?popout=1&sessionId={}", url_encode(&session_id));
    WebviewWindowBuilder::new(&app, label, WebviewUrl::App(url.into()))
        .title(format!("AgentUI - openclaw - {title}"))
        .inner_size(1000.0, 760.0)
        .min_inner_size(720.0, 520.0)
        .decorations(false)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn window_start_dragging(window: WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_minimize(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_toggle_maximize(window: WebviewWindow) -> Result<(), String> {
    if window.is_maximized().map_err(|e| e.to_string())? {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn window_close(window: WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        close_session_popouts(window.app_handle());
    }
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn settings_get(state: State<AppState>) -> AppSettings {
    state.settings.get()
}

#[tauri::command]
pub fn settings_set(state: State<AppState>, patch: AppSettings) -> Result<(), String> {
    state.settings.set(patch)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_numstat_line_handles_plain_paths() {
        let file = parse_numstat_line("12\t3\tsrc/main.rs").unwrap();

        assert_eq!(file.path, "src/main.rs");
        assert_eq!(file.adds, 12);
        assert_eq!(file.dels, 3);
    }

    #[test]
    fn parse_numstat_line_handles_renames() {
        let file = parse_numstat_line("4\t0\tsrc/{old.rs => new.rs}").unwrap();

        assert_eq!(file.path, "src/new.rs");
        assert_eq!(file.adds, 4);
        assert_eq!(file.dels, 0);
    }

    #[test]
    fn parse_numstat_line_treats_binary_counts_as_zero() {
        let file = parse_numstat_line("-\t-\tassets/icon.png").unwrap();

        assert_eq!(file.path, "assets/icon.png");
        assert_eq!(file.adds, 0);
        assert_eq!(file.dels, 0);
    }

    #[test]
    fn command_cwd_accepts_empty_and_rejects_missing_paths() {
        assert_eq!(validate_command_cwd(None).unwrap(), None);
        assert_eq!(validate_command_cwd(Some("  ".into())).unwrap(), None);

        let missing = std::env::temp_dir().join(format!(
            "agentui-missing-cwd-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let error = validate_command_cwd(Some(missing.to_string_lossy().to_string())).unwrap_err();
        assert!(error.contains("cwd does not exist"));
    }

    #[test]
    fn command_cwd_rejects_files() {
        let error = validate_command_cwd(Some("Cargo.toml".into())).unwrap_err();

        assert!(error.contains("cwd is not a directory"));
    }
}
