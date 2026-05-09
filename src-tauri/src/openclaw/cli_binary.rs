use super::{ChatEvent, EventSink};
use crate::settings::SettingsStore;
use anyhow::{anyhow, Context, Result};
use serde_json::Value;
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Read},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
};

pub struct ChatThreads {
    pub children: Arc<Mutex<HashMap<String, Child>>>,
}

impl ChatThreads {
    pub fn new() -> Self {
        Self {
            children: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn spawn_chat(
        &self,
        session_id: String,
        message_id: Option<String>,
        mut command: Command,
        on_event: EventSink,
    ) {
        let children = Arc::clone(&self.children);
        command
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        on_event(ChatEvent::Start {
            session_id: session_id.clone(),
            message_id: message_id.clone(),
        });

        thread::spawn(move || {
            let mut child = match command.spawn() {
                Ok(child) => child,
                Err(error) => {
                    on_event(ChatEvent::Error {
                        session_id: session_id.clone(),
                        error: error.to_string(),
                        message_id: message_id.clone(),
                    });
                    on_event(ChatEvent::Done {
                        session_id,
                        message_id,
                    });
                    return;
                }
            };

            let stdout = child.stdout.take();
            let stderr = child.stderr.take();
            {
                let mut guard = children.lock().expect("children mutex poisoned");
                if guard.contains_key(&session_id) {
                    let _ = child.kill();
                    let _ = child.wait();
                    on_event(ChatEvent::Error {
                        session_id: session_id.clone(),
                        error: "OpenClaw is already working on this session.".into(),
                        message_id: message_id.clone(),
                    });
                    on_event(ChatEvent::Done {
                        session_id,
                        message_id,
                    });
                    return;
                }
                guard.insert(session_id.clone(), child);
            }

            let stderr_text = Arc::new(Mutex::new(String::new()));
            let stderr_capture = Arc::clone(&stderr_text);
            let stderr_thread = stderr.map(|mut stderr| {
                thread::spawn(move || {
                    let mut text = String::new();
                    let _ = stderr.read_to_string(&mut text);
                    *stderr_capture.lock().expect("stderr mutex poisoned") = text;
                })
            });

            let mut stdout_text = String::new();
            let mut parsed_records = 0usize;
            let mut malformed_records = Vec::new();
            if let Some(stdout) = stdout {
                let mut reader = BufReader::new(stdout);
                loop {
                    let mut line = String::new();
                    match reader.read_line(&mut line) {
                        Ok(0) => break,
                        Ok(_) => {
                            stdout_text.push_str(&line);
                            let trimmed = line.trim();
                            if trimmed.is_empty() {
                                continue;
                            }
                            match serde_json::from_str::<Value>(trimmed) {
                                Ok(value) => {
                                    parsed_records += 1;
                                    super::cli_normalize::emit_chat_envelope(
                                        &session_id,
                                        &value,
                                        message_id.clone(),
                                        &on_event,
                                    );
                                }
                                Err(error) => {
                                    malformed_records.push(format!("{error}: {trimmed}"));
                                }
                            }
                        }
                        Err(error) => {
                            malformed_records.push(error.to_string());
                            break;
                        }
                    }
                }
            }

            let exit_ok = if let Some(mut child) = children
                .lock()
                .expect("children mutex poisoned")
                .remove(&session_id)
            {
                match child.wait() {
                    Ok(status) => status.success(),
                    Err(_) => false,
                }
            } else {
                true
            };

            if let Some(handle) = stderr_thread {
                let _ = handle.join();
            }

            use super::cli_normalize::emit_chat_envelope;
            if stdout_text.trim().is_empty() {
                let stderr = stderr_text
                    .lock()
                    .expect("stderr mutex poisoned")
                    .trim()
                    .to_string();
                let error = if stderr.is_empty() {
                    "openclaw agent returned no output".to_string()
                } else {
                    stderr
                };
                on_event(ChatEvent::Error {
                    session_id: session_id.clone(),
                    error,
                    message_id: message_id.clone(),
                });
            } else if parsed_records > 0 {
                for error in malformed_records {
                    on_event(ChatEvent::Error {
                        session_id: session_id.clone(),
                        error: format!("failed to parse openclaw stream JSON line: {error}"),
                        message_id: message_id.clone(),
                    });
                }
                if !exit_ok {
                    let stderr = stderr_text
                        .lock()
                        .expect("stderr mutex poisoned")
                        .trim()
                        .to_string();
                    if !stderr.is_empty() {
                        on_event(ChatEvent::Error {
                            session_id: session_id.clone(),
                            error: stderr,
                            message_id: message_id.clone(),
                        });
                    }
                }
            } else {
                match serde_json::from_str::<Value>(&stdout_text)
                    .context("failed to parse openclaw agent JSON envelope")
                {
                    Ok(value) => {
                        emit_chat_envelope(&session_id, &value, message_id.clone(), &on_event)
                    }
                    Err(error) => on_event(ChatEvent::Error {
                        session_id: session_id.clone(),
                        error: error.to_string(),
                        message_id: message_id.clone(),
                    }),
                }
                if !exit_ok {
                    let stderr = stderr_text
                        .lock()
                        .expect("stderr mutex poisoned")
                        .trim()
                        .to_string();
                    if !stderr.is_empty() {
                        on_event(ChatEvent::Error {
                            session_id: session_id.clone(),
                            error: stderr,
                            message_id: message_id.clone(),
                        });
                    }
                }
            }
            on_event(ChatEvent::Done {
                session_id,
                message_id,
            });
        });
    }

    pub fn kill_child(&self, session_id: &str) -> Option<()> {
        self.children
            .lock()
            .expect("children mutex poisoned")
            .remove(session_id)
            .map(|mut c| {
                let _ = c.kill();
                let _ = c.wait();
                ()
            })
    }
}

impl Default for ChatThreads {
    fn default() -> Self {
        Self::new()
    }
}

pub fn binary_path(settings: &Arc<SettingsStore>) -> Result<String> {
    let configured = settings.get().openclaw_path;
    if !configured.trim().is_empty() {
        return Ok(configured);
    }
    which::which("openclaw")
        .map(|path| path.to_string_lossy().to_string())
        .context("openclaw binary not found on PATH. Set Settings > Openclaw > Binary path or enable the mock adapter.")
}

pub fn build_command(settings: &Arc<SettingsStore>) -> Result<Command> {
    let mut command = Command::new(binary_path(settings)?);
    if let Ok(token) = std::env::var("OPENCLAW_GATEWAY_TOKEN") {
        if !token.trim().is_empty() {
            command.env("OPENCLAW_GATEWAY_TOKEN", token);
        }
    }
    Ok(command)
}

pub fn run_json(settings: &Arc<SettingsStore>, args: &[&str]) -> Result<Value> {
    let output = build_command(settings)?
        .args(args)
        .output()
        .with_context(|| format!("failed to run `openclaw {}`", args.join(" ")))?;
    if !output.status.success() {
        return Err(anyhow!(
            "{}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    serde_json::from_slice(&output.stdout)
        .with_context(|| format!("failed to parse `openclaw {}` JSON", args.join(" ")))
}

pub fn resolve_agent_session_id(settings: &Arc<SettingsStore>, session: &str) -> String {
    let Ok(value) = run_json(settings, &["sessions", "--json", "--all-agents"]) else {
        return session.to_string();
    };
    value
        .get("sessions")
        .or_else(|| value.get("items"))
        .or_else(|| value.get("data"))
        .and_then(Value::as_array)
        .and_then(|items| {
            items.iter().find_map(|item| {
                let key = item
                    .get("key")
                    .or_else(|| item.get("id"))
                    .and_then(Value::as_str)?;
                if key == session {
                    item.get("sessionId")
                        .or_else(|| item.get("session_id"))
                        .and_then(Value::as_str)
                        .map(str::to_string)
                } else {
                    None
                }
            })
        })
        .unwrap_or_else(|| session.to_string())
}
