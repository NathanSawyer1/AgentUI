use super::{ChatEvent, EventSink, GatewayStatus, OpenclawAdapter};
use crate::settings::SettingsStore;
use anyhow::{anyhow, Context, Result};
use serde_json::Value;
use std::{
    collections::HashMap,
    io::{BufRead, BufReader},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{SystemTime, UNIX_EPOCH},
};

// OpenClaw CLI contract, checked against https://docs.openclaw.ai/ on 2026-04-26:
// - `openclaw chat` is documented as an alias for `openclaw tui --local`; it is not the
//   scriptable JSON chat surface.
// - The documented one-shot agent command is:
//   `openclaw agent --session-id <id> --message <text> --json`
//   (`--to <dest>` or `--agent <id>` can also select a session).
// - Docs describe `--json` as a machine-readable output mode, but do not document an
//   NDJSON/SSE streaming stdout contract for `agent`. Current source writes one final
//   JSON envelope shaped like `{ payloads: [{ text, ... }], meta: { ... } }`.
// - The runtime's internal agent-event bus uses objects shaped like
//   `{ runId, seq, stream, ts, data, sessionKey? }`; if a future CLI exposes those
//   as JSONL, `normalize_chat_event` below maps assistant/lifecycle/tool-like streams.
// - `openclaw gateway status --json` returns `{ ok, degraded, durationMs, ts,
//   capability, warnings, targets: [{ id, kind, url, connect, health, summary, ... }] }`.
//   The UI still consumes the smaller `GatewayStatus` shape, so this file normalizes it.
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
        let value: Value = serde_json::from_slice(&output.stdout).context("failed to parse openclaw gateway status JSON")?;
        Ok(normalize_gateway_status(&value))
    }

    fn chat(&self, session: &str, text: &str, on_event: EventSink) -> Result<()> {
        let binary = self.binary()?;
        let session_id = session.to_string();
        let input = text.to_string();
        let children = Arc::clone(&self.children);
        thread::spawn(move || {
            let mut child = match Command::new(binary)
                .args(["agent", "--session-id", &session_id, "--message", &input, "--json"])
                .stdin(Stdio::null())
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

            let stdout = child.stdout.take();
            let stderr = child.stderr.take();
            children.lock().expect("children mutex poisoned").insert(session_id.clone(), child);
            on_event(ChatEvent::Start { session_id: session_id.clone(), message_id: None });

            let stderr_session_id = session_id.clone();
            let stderr_sink = Arc::clone(&on_event);
            let stderr_thread = stderr.map(|stderr| {
                thread::spawn(move || {
                    for line in BufReader::new(stderr).lines().flatten() {
                        let trimmed = line.trim();
                        if !trimmed.is_empty() {
                            stderr_sink(ChatEvent::Error { session_id: stderr_session_id.clone(), error: trimmed.to_string(), message_id: None });
                        }
                    }
                })
            });

            if let Some(stdout) = stdout {
                let mut buffered_json = String::new();
                for line in BufReader::new(stdout).lines().flatten() {
                    if line.trim().is_empty() {
                        continue;
                    }
                    match normalize_chat_line(&session_id, &line) {
                        Ok(events) => {
                            for event in events {
                                on_event(event);
                            }
                        }
                        Err(_) => {
                            buffered_json.push_str(&line);
                            buffered_json.push('\n');
                        }
                    }
                }
                if !buffered_json.trim().is_empty() {
                    match normalize_chat_line(&session_id, &buffered_json) {
                        Ok(events) => {
                            for event in events {
                                on_event(event);
                            }
                        }
                        Err(error) => on_event(ChatEvent::Error { session_id: session_id.clone(), error: error.to_string(), message_id: None }),
                    }
                }
            }

            if let Some(mut child) = children.lock().expect("children mutex poisoned").remove(&session_id) {
                match child.wait() {
                    Ok(status) if status.success() => {}
                    Ok(status) => on_event(ChatEvent::Error { session_id: session_id.clone(), error: format!("openclaw agent exited with {status}"), message_id: None }),
                    Err(error) => on_event(ChatEvent::Error { session_id: session_id.clone(), error: error.to_string(), message_id: None }),
                }
            }
            if let Some(handle) = stderr_thread {
                let _ = handle.join();
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

fn normalize_chat_line(session_id: &str, line: &str) -> Result<Vec<ChatEvent>> {
    if let Ok(event) = serde_json::from_str::<ChatEvent>(line) {
        return Ok(vec![event]);
    }
    let value: Value = serde_json::from_str(line)?;
    normalize_chat_event(session_id, &value).ok_or_else(|| anyhow!("unrecognized chat event: {line}"))
}

fn normalize_chat_event(session_id: &str, value: &Value) -> Option<Vec<ChatEvent>> {
    if let Some(stream) = value.get("stream").and_then(Value::as_str) {
        let data = value.get("data").unwrap_or(value);
        return match stream {
            "assistant" => data
                .get("delta")
                .or_else(|| data.get("text"))
                .and_then(Value::as_str)
                .filter(|text| !text.is_empty())
                .map(|content| vec![ChatEvent::Token { session_id: session_id.to_string(), content: content.to_string(), message_id: read_message_id(value) }]),
            "lifecycle" => match data.get("phase").and_then(Value::as_str) {
                Some("start") => Some(vec![ChatEvent::Start { session_id: session_id.to_string(), message_id: read_message_id(value) }]),
                Some("end") => Some(vec![ChatEvent::Done { session_id: session_id.to_string(), message_id: read_message_id(value) }]),
                Some("error") => Some(vec![ChatEvent::Error {
                    session_id: session_id.to_string(),
                    error: data.get("error").and_then(Value::as_str).unwrap_or("openclaw agent error").to_string(),
                    message_id: read_message_id(value),
                }]),
                _ => None,
            },
            "tool" | "item" | "command_output" => Some(vec![ChatEvent::Tool {
                session_id: session_id.to_string(),
                block: tool_block_from_event(data),
                message_id: read_message_id(value),
            }]),
            "error" => Some(vec![ChatEvent::Error {
                session_id: session_id.to_string(),
                error: data.get("error").or_else(|| data.get("message")).and_then(Value::as_str).unwrap_or("openclaw agent error").to_string(),
                message_id: read_message_id(value),
            }]),
            _ => None,
        };
    }

    if let Some(payloads) = value.get("payloads").and_then(Value::as_array) {
        let mut events = Vec::new();
        for payload in payloads {
            if let Some(text) = payload.get("text").and_then(Value::as_str) {
                events.extend(text_chunks(text).map(|content| ChatEvent::Token { session_id: session_id.to_string(), content, message_id: None }));
            }
        }
        return Some(events);
    }

    if let Some(content) = value.get("content").and_then(Value::as_str).or_else(|| value.get("token").and_then(Value::as_str)) {
        return Some(vec![ChatEvent::Token { session_id: session_id.to_string(), content: content.to_string(), message_id: read_message_id(value) }]);
    }

    if let Some(error) = value.get("error").or_else(|| value.get("message")).and_then(Value::as_str) {
        return Some(vec![ChatEvent::Error { session_id: session_id.to_string(), error: error.to_string(), message_id: read_message_id(value) }]);
    }

    None
}

fn text_chunks(text: &str) -> impl Iterator<Item = String> + '_ {
    text.split_inclusive(char::is_whitespace).map(str::to_string).filter(|chunk| !chunk.is_empty())
}

fn read_message_id(value: &Value) -> Option<String> {
    value.get("message_id")
        .or_else(|| value.get("messageId"))
        .or_else(|| value.get("runId"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn tool_block_from_event(data: &Value) -> super::ToolBlock {
    let status = match data.get("status").and_then(Value::as_str) {
        Some("completed" | "ok" | "success") => "ok",
        Some("failed" | "error" | "err") => "err",
        _ => "running",
    };
    let name = data
        .get("name")
        .or_else(|| data.get("kind"))
        .and_then(Value::as_str)
        .unwrap_or("tool")
        .to_string();
    let arg = data
        .get("meta")
        .or_else(|| data.get("summary"))
        .or_else(|| data.get("progressText"))
        .or_else(|| data.get("title"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let preview_text = data
        .get("output")
        .or_else(|| data.get("summary"))
        .or_else(|| data.get("progressText"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let preview = preview_text
        .lines()
        .take(20)
        .map(|line| super::PreviewLine { c: None, t: line.to_string() })
        .collect();
    super::ToolBlock { block_type: "tool".into(), name, arg, status: status.into(), preview }
}

fn normalize_gateway_status(value: &Value) -> GatewayStatus {
    let ok = value.get("ok").and_then(Value::as_bool).unwrap_or(false);
    let degraded = value.get("degraded").and_then(Value::as_bool).unwrap_or(false);
    let status = if ok && !degraded { "online" } else if ok { "degraded" } else { "offline" };
    let latency_ms = value
        .get("durationMs")
        .or_else(|| value.pointer("/targets/0/connect/latencyMs"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let nodes = value
        .get("targets")
        .and_then(Value::as_array)
        .map(|targets| {
            targets
                .iter()
                .map(|target| {
                    let node_ok = target.pointer("/connect/ok").and_then(Value::as_bool).unwrap_or(false);
                    let scope_limited = target.pointer("/connect/scopeLimited").and_then(Value::as_bool).unwrap_or(false);
                    let node_status = if node_ok && !scope_limited { "online" } else if node_ok { "degraded" } else { "offline" };
                    super::GatewayNode {
                        name: target.get("id").or_else(|| target.get("kind")).and_then(Value::as_str).unwrap_or("gateway").to_string(),
                        status: node_status.to_string(),
                        latency_ms: target.pointer("/connect/latencyMs").and_then(Value::as_u64).unwrap_or(0),
                        last_seen: checked_at(value),
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    let message = value
        .get("warnings")
        .and_then(Value::as_array)
        .and_then(|warnings| warnings.first())
        .and_then(|warning| warning.get("message"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| value.get("capability").and_then(Value::as_str).map(str::to_string));
    GatewayStatus {
        status: status.into(),
        latency_ms,
        checked_at: checked_at(value),
        version: value.pointer("/targets/0/self/version").and_then(Value::as_str).map(str::to_string),
        nodes,
        history: vec![latency_ms],
        message,
    }
}

fn checked_at(value: &Value) -> String {
    let millis = value.get("ts").and_then(Value::as_u64).unwrap_or_else(|| {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or(0)
    });
    format!("{millis}")
}
