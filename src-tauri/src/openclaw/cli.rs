use super::{ChatEvent, ChatSendOptions, EventSink, GatewayStatus, HistoryMessage, OpenclawAdapter, OptionItem, SessionInfo};
use crate::settings::SettingsStore;
use anyhow::{anyhow, Context, Result};
use serde_json::Value;
use std::{
    collections::{HashMap, VecDeque},
    io::{BufReader, Read},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const HISTORY_LIMIT: usize = 28;

pub struct CliOpenclawAdapter {
    settings: Arc<SettingsStore>,
    children: Arc<Mutex<HashMap<String, Child>>>,
    latency_history: Arc<Mutex<VecDeque<u64>>>,
}

impl CliOpenclawAdapter {
    pub fn new(settings: Arc<SettingsStore>) -> Self {
        Self {
            settings,
            children: Arc::new(Mutex::new(HashMap::new())),
            latency_history: Arc::new(Mutex::new(VecDeque::with_capacity(HISTORY_LIMIT))),
        }
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

    fn command(&self) -> Result<Command> {
        let mut command = Command::new(self.binary()?);
        if let Ok(token) = std::env::var("OPENCLAW_GATEWAY_TOKEN") {
            if !token.trim().is_empty() {
                command.env("OPENCLAW_GATEWAY_TOKEN", token);
            }
        }
        Ok(command)
    }

    fn run_json(&self, args: &[&str]) -> Result<Value> {
        let output = self.command()?.args(args).output().with_context(|| format!("failed to run `openclaw {}`", args.join(" ")))?;
        if !output.status.success() {
            return Err(anyhow!("{}", String::from_utf8_lossy(&output.stderr).trim()));
        }
        serde_json::from_slice(&output.stdout).with_context(|| format!("failed to parse `openclaw {}` JSON", args.join(" ")))
    }
}

impl OpenclawAdapter for CliOpenclawAdapter {
    fn gateway_status(&self) -> Result<GatewayStatus> {
        let value = self.run_json(&["gateway", "call", "health", "--json"])?;
        Ok(normalize_gateway_status(&value, &self.latency_history))
    }

    fn chat(&self, session: &str, text: &str, options: ChatSendOptions, on_event: EventSink) -> Result<()> {
        let mut command = self.command()?;
        command.args(["agent", "--session-id", session, "--message", text, "--json"]);
        if let Some(agent_id) = options.agent_id.filter(|v| !v.trim().is_empty()) {
            command.args(["--agent", agent_id.trim()]);
        }
        if let Some(model) = options.model.filter(|v| !v.trim().is_empty()) {
            command.args(["--model", model.trim()]);
        }
        if let Some(thinking) = options.thinking.filter(|v| !v.trim().is_empty()) {
            command.args(["--thinking", thinking.trim()]);
        }
        command.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());

        let session_id = session.to_string();
        let children = Arc::clone(&self.children);
        thread::spawn(move || {
            let mut child = match command.spawn() {
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
            let stderr_thread = stderr.map(|mut stderr| {
                thread::spawn(move || {
                    let mut text = String::new();
                    let _ = stderr.read_to_string(&mut text);
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        stderr_sink(ChatEvent::Error { session_id: stderr_session_id, error: trimmed.to_string(), message_id: None });
                    }
                })
            });

            let mut stdout_text = String::new();
            if let Some(stdout) = stdout {
                let mut reader = BufReader::new(stdout);
                let _ = reader.read_to_string(&mut stdout_text);
            }

            if !stdout_text.trim().is_empty() {
                match serde_json::from_str::<Value>(&stdout_text).context("failed to parse openclaw agent JSON envelope") {
                    Ok(value) => emit_chat_envelope(&session_id, &value, &on_event),
                    Err(error) => on_event(ChatEvent::Error { session_id: session_id.clone(), error: error.to_string(), message_id: None }),
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

    fn models_list(&self) -> Result<Vec<OptionItem>> {
        let value = self.run_json(&["models", "list", "--json"])?;
        Ok(normalize_options(&value, "model"))
    }

    fn agents_list(&self) -> Result<Vec<OptionItem>> {
        match self.run_json(&["agents", "list", "--json"]) {
            Ok(value) => Ok(normalize_options(&value, "agent")),
            Err(_) => {
                let fallback = vec!["main".into(), "coder".into(), "reviewer".into(), "explore".into(), "mini".into(), "research-lite".into()];
                let agents = self
                    .run_json(&["health", "--json"])
                    .ok()
                    .and_then(|value| value.get("agents").and_then(Value::as_array).map(|items| items.iter().filter_map(value_id).collect::<Vec<_>>()))
                    .filter(|items| !items.is_empty())
                    .unwrap_or(fallback);
                Ok(agents
                    .into_iter()
                    .map(|id| OptionItem { id: id.clone(), name: id, meta: "agent".into(), desc: "OpenClaw agent".into(), active: None })
                    .collect())
            }
        }
    }

    fn sessions_list(&self) -> Result<Vec<SessionInfo>> {
        let value = self.run_json(&["sessions", "--json", "--all-agents"])?;
        Ok(normalize_sessions(&value))
    }

    fn session_history(&self, session: &str, limit: usize) -> Result<Vec<HistoryMessage>> {
        let params = serde_json::json!({ "sessionKey": session, "limit": limit }).to_string();
        let output = self
            .command()?
            .args(["gateway", "call", "chat.history", "--json", "--params", &params])
            .output()
            .context("failed to run `openclaw gateway call chat.history --json`")?;
        if !output.status.success() {
            return Err(anyhow!("{}", String::from_utf8_lossy(&output.stderr).trim()));
        }
        let value: Value = serde_json::from_slice(&output.stdout).context("failed to parse chat.history JSON")?;
        Ok(normalize_history_messages(&value))
    }
}

fn emit_chat_envelope(session_id: &str, value: &Value, on_event: &EventSink) {
    if let Some(events) = normalize_chat_event(session_id, value) {
        for event in events {
            if matches!(event, ChatEvent::Token { .. }) {
                thread::sleep(Duration::from_millis(20));
            }
            on_event(event);
        }
    }

    for tool in value.pointer("/meta/tools").and_then(Value::as_array).into_iter().flatten() {
        on_event(ChatEvent::Tool { session_id: session_id.to_string(), block: tool_block_from_event(tool), message_id: read_message_id(value) });
    }
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
            "tool" | "item" | "command_output" => Some(vec![ChatEvent::Tool { session_id: session_id.to_string(), block: tool_block_from_event(data), message_id: read_message_id(value) }]),
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
                events.extend(text_chunks(text).map(|content| ChatEvent::Token { session_id: session_id.to_string(), content, message_id: read_message_id(payload) }));
            }
        }
        return Some(events);
    }

    if let Some(content) = value.get("text").or_else(|| value.get("content")).or_else(|| value.get("token")).and_then(Value::as_str) {
        return Some(text_chunks(content).map(|content| ChatEvent::Token { session_id: session_id.to_string(), content, message_id: read_message_id(value) }).collect());
    }

    if let Some(error) = value.get("error").or_else(|| value.get("message")).and_then(Value::as_str) {
        return Some(vec![ChatEvent::Error { session_id: session_id.to_string(), error: error.to_string(), message_id: read_message_id(value) }]);
    }

    None
}

fn text_chunks(text: &str) -> impl Iterator<Item = String> + '_ {
    let mut chunks = Vec::new();
    let mut current = String::new();
    for ch in text.chars() {
        current.push(ch);
        if current.len() >= 30 && ch.is_whitespace() {
            chunks.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        chunks.push(current);
    }
    chunks.into_iter()
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
    let name = data.get("name").or_else(|| data.get("kind")).and_then(Value::as_str).unwrap_or("tool").to_string();
    let arg = data
        .get("arg")
        .or_else(|| data.get("meta"))
        .or_else(|| data.get("summary"))
        .or_else(|| data.get("title"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let preview_text = data.get("output").or_else(|| data.get("summary")).or_else(|| data.get("progressText")).and_then(Value::as_str).unwrap_or("");
    let preview = preview_text.lines().take(20).map(|line| super::PreviewLine { c: None, t: line.to_string() }).collect();
    super::ToolBlock { block_type: "tool".into(), name, arg, status: status.into(), preview }
}

fn normalize_gateway_status(value: &Value, history_store: &Arc<Mutex<VecDeque<u64>>>) -> GatewayStatus {
    let ok = value.get("ok").and_then(Value::as_bool).unwrap_or(false);
    let status = if ok { "online" } else { "offline" };
    let latency_ms = value.get("durationMs").and_then(Value::as_u64).unwrap_or(0);
    let checked = checked_at(value);

    let mut nodes = Vec::new();
    if let Some(plugins) = value.pointer("/plugins/loaded").and_then(Value::as_array) {
        for plugin in plugins {
            if let Some(id) = value_id(plugin) {
                nodes.push(super::GatewayNode { name: format!("plugin:{id}"), status: "online".into(), latency_ms: 0, last_seen: checked.clone() });
            }
        }
    }
    if let Some(channels) = value.get("channels").and_then(Value::as_object) {
        for (name, channel) in channels {
            let channel_ok = channel.get("ok").and_then(Value::as_bool).unwrap_or(true);
            nodes.push(super::GatewayNode { name: format!("channel:{name}"), status: if channel_ok { "online" } else { "offline" }.into(), latency_ms: 0, last_seen: checked.clone() });
        }
    }
    if nodes.is_empty() {
        nodes.push(super::GatewayNode { name: "gateway".into(), status: status.into(), latency_ms, last_seen: checked.clone() });
    }

    let history = {
        let mut history = history_store.lock().expect("latency history mutex poisoned");
        history.push_back(latency_ms);
        while history.len() > HISTORY_LIMIT {
            history.pop_front();
        }
        history.iter().copied().collect()
    };

    GatewayStatus {
        status: status.into(),
        latency_ms,
        checked_at: checked,
        version: value.pointer("/gateway/version").or_else(|| value.get("version")).and_then(Value::as_str).map(str::to_string),
        nodes,
        history,
        message: value.get("message").and_then(Value::as_str).map(str::to_string),
    }
}

fn checked_at(value: &Value) -> String {
    if let Some(ts) = value.get("ts").and_then(Value::as_str) {
        return ts.to_string();
    }
    let millis = value.get("ts").and_then(Value::as_u64).unwrap_or_else(|| {
        SystemTime::now().duration_since(UNIX_EPOCH).map(|duration| duration.as_millis() as u64).unwrap_or(0)
    });
    format!("{millis}")
}

fn normalize_options(value: &Value, default_meta: &str) -> Vec<OptionItem> {
    let items = value
        .get("models")
        .or_else(|| value.get("agents"))
        .or_else(|| value.get("items"))
        .or_else(|| value.get("data"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_else(|| value.as_array().cloned().unwrap_or_default());

    items
        .iter()
        .filter_map(|item| {
            let id = value_id(item)?;
            let name = item.get("name").and_then(Value::as_str).unwrap_or(&id).to_string();
            let meta = item.get("provider").or_else(|| item.get("meta")).or_else(|| item.get("model")).and_then(Value::as_str).unwrap_or(default_meta).to_string();
            let desc = item.get("description").or_else(|| item.get("desc")).and_then(Value::as_str).unwrap_or("").to_string();
            Some(OptionItem { id, name, meta, desc, active: None })
        })
        .collect()
}

fn normalize_sessions(value: &Value) -> Vec<SessionInfo> {
    let items = value
        .get("sessions")
        .or_else(|| value.get("items"))
        .or_else(|| value.get("data"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_else(|| value.as_array().cloned().unwrap_or_default());

    items
        .iter()
        .filter_map(|item| {
            let id = item
                .get("key")
                .or_else(|| item.get("id"))
                .or_else(|| item.get("sessionId"))
                .or_else(|| item.get("session_id"))
                .and_then(Value::as_str)?
                .to_string();
            let age_ms = item.get("ageMs").or_else(|| item.get("age_ms")).and_then(Value::as_u64);
            let time = age_ms.map(format_age).or_else(|| item.get("updatedAt").or_else(|| item.get("updated_at")).and_then(Value::as_str).map(str::to_string)).unwrap_or_default();
            let updated_at = item.get("updatedAt").or_else(|| item.get("updated_at")).and_then(Value::as_str).map(str::to_string);
            Some(SessionInfo { id: id.clone(), name: id, status: "idle".into(), time, active: None, age_ms, updated_at })
        })
        .collect()
}

fn normalize_history_messages(value: &Value) -> Vec<HistoryMessage> {
    let messages = value
        .get("messages")
        .or_else(|| value.pointer("/history/messages"))
        .or_else(|| value.get("items"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    messages
        .iter()
        .filter_map(|message| {
            let role = message.get("role").and_then(Value::as_str)?.to_lowercase();
            if role != "user" && role != "assistant" {
                return None;
            }
            let text = message_text(message).trim().to_string();
            if text.is_empty() {
                return None;
            }
            let id = message
                .get("id")
                .or_else(|| message.get("messageId"))
                .or_else(|| message.get("message_id"))
                .and_then(Value::as_str)
                .map(str::to_string);
            let timestamp = message.get("timestamp").or_else(|| message.get("createdAt")).and_then(Value::as_u64);
            Some(HistoryMessage { id, role, text, timestamp })
        })
        .collect()
}

fn message_text(message: &Value) -> String {
    if let Some(text) = message.get("text").and_then(Value::as_str) {
        return text.to_string();
    }
    if let Some(content) = message.get("content") {
        if let Some(text) = content.as_str() {
            return text.to_string();
        }
        if let Some(blocks) = content.as_array() {
            return blocks
                .iter()
                .filter_map(|block| {
                    block
                        .get("text")
                        .or_else(|| block.get("content"))
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
                .collect::<Vec<_>>()
                .join("\n");
        }
    }
    String::new()
}

fn value_id(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::to_string)
        .or_else(|| value.get("id").or_else(|| value.get("key")).or_else(|| value.get("name")).and_then(Value::as_str).map(str::to_string))
}

fn format_age(ms: u64) -> String {
    let seconds = ms / 1000;
    if seconds < 60 {
        format!("{seconds}s")
    } else if seconds < 3600 {
        format!("{}m", seconds / 60)
    } else if seconds < 86_400 {
        format!("{}h", seconds / 3600)
    } else {
        format!("{}d", seconds / 86_400)
    }
}
