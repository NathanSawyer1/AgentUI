use super::{ChatEvent, EventSink, GatewayStatus, OpenclawAdapter};
use crate::settings::SettingsStore;
use anyhow::{anyhow, Context, Result};
use serde_json::Value;
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Write},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
};

pub struct CliOpenclawAdapter {
    settings: Arc<SettingsStore>,
    children: Arc<Mutex<HashMap<String, Child>>>,
}

impl CliOpenclawAdapter {
    pub fn new(settings: Arc<SettingsStore>) -> Self {
        Self { settings, children: Arc::new(Mutex::new(HashMap::new())) }
    }

    fn binary(&self) -> Result<String> {
        let configured = self.settings.get().openclaw_path;
        if !configured.trim().is_empty() {
            return Ok(configured);
        }
        which::which("openclaw")
            .map(|path| path.to_string_lossy().to_string())
            .context("openclaw binary not found on PATH. Set Settings > Openclaw > Binary path or enable the mock adapter.")
    }
}

impl OpenclawAdapter for CliOpenclawAdapter {
    fn gateway_status(&self) -> Result<GatewayStatus> {
        let output = Command::new(self.binary()?)
            .args(["gateway", "status", "--json"])
            .output()
            .context("failed to run `openclaw gateway status --json`")?;
        if !output.status.success() {
            return Err(anyhow!("{}", String::from_utf8_lossy(&output.stderr).trim()));
        }
        serde_json::from_slice(&output.stdout).context("failed to parse openclaw gateway status JSON")
    }

    fn chat(&self, session: &str, text: &str, on_event: EventSink) -> Result<()> {
        let binary = self.binary()?;
        let session_id = session.to_string();
        let input = text.to_string();
        let children = Arc::clone(&self.children);
        thread::spawn(move || {
            let mut child = match Command::new(binary)
                .args(["chat", "--session", &session_id, "--json"])
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
            {
                Ok(child) => child,
                Err(error) => {
                    on_event(ChatEvent::Error { session_id, error: error.to_string(), message_id: None });
                    return;
                }
            };

            if let Some(stdin) = child.stdin.as_mut() {
                let _ = stdin.write_all(input.as_bytes());
                let _ = stdin.write_all(b"\n");
            }

            let stdout = child.stdout.take();
            children.lock().expect("children mutex poisoned").insert(session_id.clone(), child);
            on_event(ChatEvent::Start { session_id: session_id.clone(), message_id: None });

            if let Some(stdout) = stdout {
                for line in BufReader::new(stdout).lines().flatten() {
                    if line.trim().is_empty() {
                        continue;
                    }
                    match serde_json::from_str::<ChatEvent>(&line).or_else(|_| parse_loose_event(&session_id, &line)) {
                        Ok(event) => on_event(event),
                        Err(error) => on_event(ChatEvent::Error { session_id: session_id.clone(), error: error.to_string(), message_id: None }),
                    }
                }
            }

            if let Some(mut child) = children.lock().expect("children mutex poisoned").remove(&session_id) {
                let _ = child.wait();
            }
            on_event(ChatEvent::Done { session_id, message_id: None });
        });
        Ok(())
    }

    fn chat_cancel(&self, session: &str) -> Result<()> {
        if let Some(mut child) = self.children.lock().expect("children mutex poisoned").remove(session) {
            child.kill().context("failed to kill openclaw chat process")?;
        }
        Ok(())
    }
}

fn parse_loose_event(session_id: &str, line: &str) -> Result<ChatEvent> {
    let value: Value = serde_json::from_str(line)?;
    if let Some(content) = value.get("content").and_then(Value::as_str).or_else(|| value.get("token").and_then(Value::as_str)) {
        return Ok(ChatEvent::Token { session_id: session_id.to_string(), content: content.to_string(), message_id: None });
    }
    Err(anyhow!("unrecognized chat event: {line}"))
}
