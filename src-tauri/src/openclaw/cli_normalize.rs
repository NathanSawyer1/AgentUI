use super::{ChatEvent, ToolBlock};
use serde_json::Value;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::Duration;

const HISTORY_LIMIT: usize = 28;

pub fn normalize_gateway_status(
    value: &Value,
    history_store: &Arc<Mutex<VecDeque<u64>>>,
) -> super::GatewayStatus {
    let ok = value.get("ok").and_then(Value::as_bool).unwrap_or(false);
    let status = if ok { "online" } else { "offline" };
    let latency_ms = value.get("durationMs").and_then(Value::as_u64).unwrap_or(0);
    let checked = checked_at(value);

    let mut nodes = Vec::new();
    if let Some(plugins) = value.pointer("/plugins/loaded").and_then(Value::as_array) {
        for plugin in plugins {
            if let Some(id) = value_id(plugin) {
                nodes.push(super::GatewayNode {
                    name: format!("plugin:{id}"),
                    status: "online".into(),
                    latency_ms: 0,
                    last_seen: checked.clone(),
                });
            }
        }
    }
    if let Some(channels) = value.get("channels").and_then(Value::as_object) {
        for (name, channel) in channels {
            let channel_ok = channel.get("ok").and_then(Value::as_bool).unwrap_or(true);
            nodes.push(super::GatewayNode {
                name: format!("channel:{name}"),
                status: if channel_ok { "online" } else { "offline" }.into(),
                latency_ms: 0,
                last_seen: checked.clone(),
            });
        }
    }
    if nodes.is_empty() {
        nodes.push(super::GatewayNode {
            name: "gateway".into(),
            status: status.into(),
            latency_ms,
            last_seen: checked.clone(),
        });
    }

    let history = {
        let mut history = history_store
            .lock()
            .expect("latency history mutex poisoned");
        history.push_back(latency_ms);
        while history.len() > HISTORY_LIMIT {
            history.pop_front();
        }
        history.iter().copied().collect()
    };

    super::GatewayStatus {
        status: status.into(),
        latency_ms,
        checked_at: checked,
        version: value
            .pointer("/gateway/version")
            .or_else(|| value.get("version"))
            .and_then(Value::as_str)
            .map(str::to_string),
        nodes,
        history,
        message: value
            .get("message")
            .and_then(Value::as_str)
            .map(str::to_string),
    }
}

pub fn checked_at(value: &Value) -> String {
    if let Some(ts) = value.get("ts").and_then(Value::as_str) {
        return ts.to_string();
    }
    let millis = value.get("ts").and_then(Value::as_u64).unwrap_or_else(|| {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or(0)
    });
    format!("{millis}")
}

pub fn normalize_options(value: &Value, default_meta: &str) -> Vec<super::OptionItem> {
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
            let name = item
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or(&id)
                .to_string();
            let meta = item
                .get("provider")
                .or_else(|| item.get("meta"))
                .or_else(|| item.get("model"))
                .and_then(Value::as_str)
                .unwrap_or(default_meta)
                .to_string();
            let desc = item
                .get("description")
                .or_else(|| item.get("desc"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            Some(super::OptionItem {
                id,
                name,
                meta,
                desc,
                active: None,
            })
        })
        .collect()
}

pub fn normalize_skills(value: &Value) -> Vec<super::SkillItem> {
    value
        .get("skills")
        .or_else(|| value.get("items"))
        .or_else(|| value.get("data"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_else(|| value.as_array().cloned().unwrap_or_default())
        .into_iter()
        .filter_map(|item| serde_json::from_value::<super::SkillItem>(item).ok())
        .collect()
}

pub fn normalize_sessions(value: &Value) -> Vec<super::SessionInfo> {
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
            let age_ms = item
                .get("ageMs")
                .or_else(|| item.get("age_ms"))
                .and_then(Value::as_u64);
            let time = age_ms
                .map(format_age)
                .or_else(|| {
                    item.get("updatedAt")
                        .or_else(|| item.get("updated_at"))
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
                .unwrap_or_default();
            let updated_at = item
                .get("updatedAt")
                .or_else(|| item.get("updated_at"))
                .and_then(Value::as_str)
                .map(str::to_string);
            Some(super::SessionInfo {
                id: id.clone(),
                name: id,
                status: "idle".into(),
                time,
                active: None,
                age_ms,
                updated_at,
            })
        })
        .collect()
}

pub fn normalize_session_create(value: &Value) -> Option<super::SessionInfo> {
    let id = find_session_id(value)?;
    Some(super::SessionInfo {
        id: id.clone(),
        name: id,
        status: "idle".into(),
        time: "new".into(),
        active: Some(true),
        age_ms: Some(0),
        updated_at: None,
    })
}

fn find_session_id(value: &Value) -> Option<String> {
    if let Some(id) = value
        .get("sessionId")
        .or_else(|| value.get("session_id"))
        .or_else(|| value.get("sessionKey"))
        .or_else(|| value.get("session_key"))
        .or_else(|| value.get("key"))
        .or_else(|| value.get("id"))
        .and_then(Value::as_str)
        .filter(|id| !id.trim().is_empty())
    {
        return Some(id.to_string());
    }

    match value {
        Value::Array(items) => items.iter().find_map(find_session_id),
        Value::Object(map) => {
            for key in [
                "session", "data", "result", "envelope", "message", "metadata",
            ] {
                if let Some(id) = map.get(key).and_then(find_session_id) {
                    return Some(id);
                }
            }
            map.values().find_map(find_session_id)
        }
        _ => None,
    }
}

pub fn normalize_history_messages(value: &Value) -> Vec<super::HistoryMessage> {
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
            let timestamp = message
                .get("timestamp")
                .or_else(|| message.get("createdAt"))
                .and_then(Value::as_u64);
            Some(super::HistoryMessage {
                id,
                role,
                text,
                timestamp,
            })
        })
        .collect()
}

pub fn value_id(value: &Value) -> Option<String> {
    value.as_str().map(str::to_string).or_else(|| {
        value
            .get("id")
            .or_else(|| value.get("key"))
            .or_else(|| value.get("name"))
            .and_then(Value::as_str)
            .map(str::to_string)
    })
}

pub fn format_age(ms: u64) -> String {
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

pub fn message_text(message: &Value) -> String {
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

pub fn normalize_chat_event(session_id: &str, value: &Value) -> Option<Vec<ChatEvent>> {
    if let Some(stream) = value.get("stream").and_then(Value::as_str) {
        let data = value.get("data").unwrap_or(value);
        return match stream {
            "assistant" => data
                .get("delta")
                .or_else(|| data.get("text"))
                .and_then(Value::as_str)
                .filter(|text| !text.is_empty())
                .map(|content| {
                    vec![ChatEvent::Token {
                        session_id: session_id.to_string(),
                        content: content.to_string(),
                        message_id: read_message_id(value),
                    }]
                }),
            "tool" | "item" | "command_output" => Some(vec![ChatEvent::Tool {
                session_id: session_id.to_string(),
                block: tool_block_from_event(data),
                message_id: read_message_id(value),
                activity_id: read_activity_id(data).or_else(|| read_activity_id(value)),
            }]),
            "error" => Some(vec![ChatEvent::Error {
                session_id: session_id.to_string(),
                error: data
                    .get("error")
                    .or_else(|| data.get("message"))
                    .and_then(Value::as_str)
                    .unwrap_or("openclaw agent error")
                    .to_string(),
                message_id: read_message_id(value),
            }]),
            "start" | "message_start" | "turn_start" => Some(vec![ChatEvent::Start {
                session_id: session_id.to_string(),
                message_id: read_message_id(value),
            }]),
            "done" | "complete" | "message_stop" | "turn_done" => Some(vec![ChatEvent::Done {
                session_id: session_id.to_string(),
                message_id: read_message_id(value),
            }]),
            _ => Some(vec![ChatEvent::Tool {
                session_id: session_id.to_string(),
                block: tool_block_from_event(data),
                message_id: read_message_id(value),
                activity_id: read_activity_id(data).or_else(|| read_activity_id(value)),
            }]),
        };
    }

    if let Some(event_name) = value
        .get("type")
        .or_else(|| value.get("event"))
        .or_else(|| value.get("kind"))
        .and_then(Value::as_str)
        .map(str::to_ascii_lowercase)
    {
        let data = value
            .get("data")
            .or_else(|| value.get("payload"))
            .or_else(|| value.get("delta"))
            .unwrap_or(value);
        if matches!(
            event_name.as_str(),
            "start" | "message_start" | "assistant_start" | "turn_start"
        ) {
            return Some(vec![ChatEvent::Start {
                session_id: session_id.to_string(),
                message_id: read_message_id(value),
            }]);
        }
        if matches!(
            event_name.as_str(),
            "done" | "complete" | "completed" | "message_stop" | "turn_done" | "turn_complete"
        ) {
            return Some(vec![ChatEvent::Done {
                session_id: session_id.to_string(),
                message_id: read_message_id(value),
            }]);
        }
        if matches!(event_name.as_str(), "error" | "failed" | "failure") {
            return Some(vec![ChatEvent::Error {
                session_id: session_id.to_string(),
                error: data
                    .get("error")
                    .or_else(|| data.get("message"))
                    .or_else(|| value.get("error"))
                    .or_else(|| value.get("message"))
                    .and_then(Value::as_str)
                    .unwrap_or("openclaw agent error")
                    .to_string(),
                message_id: read_message_id(value),
            }]);
        }
        if matches!(
            event_name.as_str(),
            "token"
                | "delta"
                | "text_delta"
                | "assistant_delta"
                | "message_delta"
                | "assistant_token"
        ) {
            if let Some(content) = data
                .get("text")
                .or_else(|| data.get("content"))
                .or_else(|| data.get("delta"))
                .or_else(|| value.get("text"))
                .or_else(|| value.get("content"))
                .or_else(|| value.get("token"))
                .and_then(Value::as_str)
                .filter(|text| !text.is_empty())
            {
                return Some(vec![ChatEvent::Token {
                    session_id: session_id.to_string(),
                    content: content.to_string(),
                    message_id: read_message_id(value),
                }]);
            }
        }
        if event_name.contains("tool")
            || event_name.contains("command")
            || event_name.contains("activity")
            || event_name.contains("item")
        {
            return Some(vec![ChatEvent::Tool {
                session_id: session_id.to_string(),
                block: tool_block_from_event(data),
                message_id: read_message_id(value),
                activity_id: read_activity_id(data).or_else(|| read_activity_id(value)),
            }]);
        }
    }

    if let Some(payloads) = value.get("payloads").and_then(Value::as_array) {
        let mut events = Vec::new();
        for payload in payloads {
            if let Some(text) = payload.get("text").and_then(Value::as_str) {
                events.extend(text_chunks(text).map(|content| ChatEvent::Token {
                    session_id: session_id.to_string(),
                    content,
                    message_id: read_message_id(payload),
                }));
            }
        }
        return Some(events);
    }

    if let Some(content) = value
        .get("text")
        .or_else(|| value.get("content"))
        .or_else(|| value.get("token"))
        .and_then(Value::as_str)
    {
        return Some(
            text_chunks(content)
                .map(|content| ChatEvent::Token {
                    session_id: session_id.to_string(),
                    content,
                    message_id: read_message_id(value),
                })
                .collect(),
        );
    }

    if let Some(error) = value
        .get("error")
        .or_else(|| value.get("message"))
        .and_then(Value::as_str)
    {
        return Some(vec![ChatEvent::Error {
            session_id: session_id.to_string(),
            error: error.to_string(),
            message_id: read_message_id(value),
        }]);
    }

    if value.is_object() && value.pointer("/meta/tools").is_none() {
        return Some(vec![ChatEvent::Tool {
            session_id: session_id.to_string(),
            block: tool_block_from_event(value),
            message_id: read_message_id(value),
            activity_id: read_activity_id(value),
        }]);
    }

    None
}

pub fn text_chunks(text: &str) -> impl Iterator<Item = String> + '_ {
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

pub fn read_message_id(value: &Value) -> Option<String> {
    value
        .get("message_id")
        .or_else(|| value.get("messageId"))
        .or_else(|| value.get("runId"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

pub fn read_activity_id(value: &Value) -> Option<String> {
    value
        .get("activity_id")
        .or_else(|| value.get("activityId"))
        .or_else(|| value.get("tool_call_id"))
        .or_else(|| value.get("toolCallId"))
        .or_else(|| value.get("call_id"))
        .or_else(|| value.get("callId"))
        .or_else(|| value.get("id"))
        .or_else(|| value.get("runId"))
        .and_then(Value::as_str)
        .filter(|id| !id.trim().is_empty())
        .map(str::to_string)
}

pub fn tool_block_from_event(data: &Value) -> ToolBlock {
    let status = activity_status(data);
    let activity_id = read_activity_id(data);
    let name = data
        .get("name")
        .or_else(|| data.get("tool"))
        .or_else(|| data.get("kind"))
        .and_then(Value::as_str)
        .unwrap_or("activity")
        .to_string();
    let kind = activity_kind(&name, data);
    let input = first_present(
        data,
        &[
            "input",
            "arguments",
            "args",
            "params",
            "request",
            "body",
            "command",
            "cmd",
        ],
    );
    let output = first_present(
        data,
        &["output", "stdout", "result", "response", "progressText"],
    );
    let error = first_present(data, &["error", "stderr", "message"]).filter(|_| status == "err");
    let metadata = activity_metadata(data);
    let summary = activity_summary(data, &name, input.as_ref(), output.as_ref());
    let title = data
        .get("title")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| activity_title(&kind, &name));
    let preview_text = output
        .as_ref()
        .and_then(Value::as_str)
        .or_else(|| data.get("summary").and_then(Value::as_str))
        .or_else(|| data.get("progressText").and_then(Value::as_str))
        .unwrap_or("");
    let preview = preview_text
        .lines()
        .take(20)
        .map(|line| super::PreviewLine {
            c: None,
            t: line.to_string(),
        })
        .collect();
    let arg = data
        .get("arg")
        .or_else(|| data.get("summary"))
        .or_else(|| data.get("title"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| input.as_ref().map(compact_value));

    ToolBlock {
        block_type: "tool".into(),
        id: activity_id.clone(),
        activity_id,
        kind,
        title,
        summary,
        status,
        started_at: data
            .get("startedAt")
            .or_else(|| data.get("started_at"))
            .and_then(Value::as_str)
            .map(str::to_string),
        updated_at: data
            .get("updatedAt")
            .or_else(|| data.get("updated_at"))
            .or_else(|| data.get("completedAt"))
            .or_else(|| data.get("completed_at"))
            .and_then(Value::as_str)
            .map(str::to_string),
        input,
        output,
        error,
        metadata,
        raw: Some(data.clone()),
        name: Some(name),
        arg,
        preview,
    }
}

pub fn activity_status(data: &Value) -> String {
    match data
        .get("status")
        .and_then(Value::as_str)
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("completed" | "complete" | "ok" | "success" | "succeeded" | "done") => "ok".into(),
        Some("failed" | "failure" | "error" | "err" | "cancelled" | "canceled") => "err".into(),
        _ if data.get("error").is_some() || data.get("stderr").is_some() => "err".into(),
        _ => "running".into(),
    }
}

pub fn activity_kind(name: &str, data: &Value) -> String {
    if data.get("command").is_some()
        || data.get("cmd").is_some()
        || data.get("stdout").is_some()
        || data.get("stderr").is_some()
        || data.get("exitCode").is_some()
        || data.get("exit_code").is_some()
    {
        return "terminal".into();
    }
    if data.get("agentId").is_some() || data.get("agent_id").is_some() {
        return "subagent".into();
    }
    if data.get("url").is_some() || data.get("uri").is_some() {
        return "network".into();
    }
    if data.get("path").is_some() || data.get("file").is_some() {
        return "file".into();
    }
    let haystack = format!(
        "{} {} {}",
        name,
        data.get("kind").and_then(Value::as_str).unwrap_or_default(),
        data.get("type").and_then(Value::as_str).unwrap_or_default()
    )
    .to_ascii_lowercase();
    if [
        "bash",
        "shell",
        "command",
        "exec",
        "terminal",
        "command_output",
    ]
    .iter()
    .any(|needle| haystack.contains(needle))
    {
        return "terminal".into();
    }
    if ["agent", "subagent", "spawn", "delegate"]
        .iter()
        .any(|needle| haystack.contains(needle))
    {
        return "subagent".into();
    }
    if ["read", "write", "edit", "file", "patch"]
        .iter()
        .any(|needle| haystack.contains(needle))
    {
        return "file".into();
    }
    if ["grep", "search", "find", "rg"]
        .iter()
        .any(|needle| haystack.contains(needle))
    {
        return "search".into();
    }
    if ["fetch", "http", "curl", "web", "network", "request"]
        .iter()
        .any(|needle| haystack.contains(needle))
    {
        return "network".into();
    }
    if name == "activity" {
        "unknown".into()
    } else {
        "tool".into()
    }
}

pub fn activity_title(kind: &str, name: &str) -> String {
    match kind {
        "terminal" => "Terminal".into(),
        "subagent" => "Subagent".into(),
        "file" => "File".into(),
        "search" => "Search".into(),
        "network" => "Network".into(),
        "unknown" => "Activity".into(),
        _ => name.to_string(),
    }
}

pub fn activity_summary(
    data: &Value,
    name: &str,
    input: Option<&Value>,
    output: Option<&Value>,
) -> String {
    if let Some(summary) = data
        .get("summary")
        .or_else(|| data.get("title"))
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
    {
        return summary.to_string();
    }
    if let Some(command) = data
        .get("command")
        .or_else(|| data.get("cmd"))
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
    {
        return command.to_string();
    }
    if let Some(path) = data
        .get("path")
        .or_else(|| data.get("file"))
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
    {
        return path.to_string();
    }
    if let Some(input) = input {
        return compact_value(input);
    }
    if let Some(output) = output
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
    {
        return output.lines().next().unwrap_or(output).to_string();
    }
    name.to_string()
}

pub fn first_present(data: &Value, keys: &[&str]) -> Option<Value> {
    keys.iter()
        .find_map(|key| data.get(*key).filter(|value| !value.is_null()).cloned())
}

pub fn activity_metadata(data: &Value) -> Option<Value> {
    use serde_json::{Map, Value as JsonValue};
    let mut meta = Map::new();
    for key in [
        "cwd",
        "id",
        "activity_id",
        "activityId",
        "tool_call_id",
        "toolCallId",
        "duration",
        "durationMs",
        "elapsedMs",
        "exitCode",
        "exit_code",
        "agentId",
        "agent_id",
        "sessionId",
        "session_id",
        "model",
        "startedAt",
        "started_at",
        "completedAt",
        "completed_at",
        "updatedAt",
        "updated_at",
        "timestamp",
        "ts",
    ] {
        if let Some(value) = data.get(key).filter(|value| !value.is_null()) {
            meta.insert(key.to_string(), value.clone());
        }
    }
    if meta.is_empty() {
        None
    } else {
        Some(JsonValue::Object(meta))
    }
}

pub fn compact_value(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        _ => serde_json::to_string(value).unwrap_or_else(|_| String::new()),
    }
}

pub fn emit_chat_envelope(
    session_id: &str,
    value: &Value,
    preferred_message_id: Option<String>,
    on_event: &super::EventSink,
) {
    use super::ChatEvent;
    let envelope_message_id = read_message_id(value);
    let message_id = preferred_message_id
        .clone()
        .or_else(|| envelope_message_id.clone());
    if let Some(error) = value
        .get("error")
        .or_else(|| value.pointer("/result/error"))
        .and_then(Value::as_str)
    {
        on_event(ChatEvent::Error {
            session_id: session_id.to_string(),
            error: error.to_string(),
            message_id,
        });
        return;
    }

    let payload_root = value.get("result").unwrap_or(value);
    let mut emitted_content = false;
    if let Some(events) = normalize_chat_event(session_id, payload_root) {
        for event in events {
            emitted_content = true;
            let event = with_preferred_message_id(
                event,
                preferred_message_id
                    .clone()
                    .or_else(|| envelope_message_id.clone()),
            );
            if matches!(event, ChatEvent::Token { .. }) {
                std::thread::sleep(Duration::from_millis(20));
            }
            on_event(event);
        }
    }

    for tool in payload_root
        .pointer("/meta/tools")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let block = tool_block_from_event(tool);
        let activity_id = block.activity_id.clone();
        emitted_content = true;
        on_event(ChatEvent::Tool {
            session_id: session_id.to_string(),
            block,
            message_id: preferred_message_id
                .clone()
                .or_else(|| envelope_message_id.clone()),
            activity_id,
        });
    }

    if !emitted_content {
        on_event(ChatEvent::Error {
            session_id: session_id.to_string(),
            error: "openclaw agent returned no displayable content".into(),
            message_id,
        });
    }
}

fn with_preferred_message_id(
    event: super::ChatEvent,
    preferred: Option<String>,
) -> super::ChatEvent {
    use super::ChatEvent;
    match event {
        ChatEvent::Start {
            session_id,
            message_id,
        } => ChatEvent::Start {
            session_id,
            message_id: preferred.or(message_id),
        },
        ChatEvent::Token {
            session_id,
            content,
            message_id,
        } => ChatEvent::Token {
            session_id,
            content,
            message_id: preferred.or(message_id),
        },
        ChatEvent::Tool {
            session_id,
            block,
            message_id,
            activity_id,
        } => ChatEvent::Tool {
            session_id,
            block,
            message_id: preferred.or(message_id),
            activity_id,
        },
        ChatEvent::Done {
            session_id,
            message_id,
        } => ChatEvent::Done {
            session_id,
            message_id: preferred.or(message_id),
        },
        ChatEvent::Error {
            session_id,
            error,
            message_id,
        } => ChatEvent::Error {
            session_id,
            error,
            message_id: preferred.or(message_id),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn normalizes_gateway_status_with_plugin_nodes_and_history() {
        let history = Arc::new(Mutex::new(VecDeque::new()));
        let status = normalize_gateway_status(
            &json!({
                "ok": true,
                "durationMs": 42,
                "ts": "2026-05-05T12:00:00Z",
                "gateway": { "version": "2026.5.1" },
                "plugins": { "loaded": [{ "id": "github" }] },
                "channels": { "events": { "ok": false } }
            }),
            &history,
        );

        assert_eq!(status.status, "online");
        assert_eq!(status.latency_ms, 42);
        assert_eq!(status.version.as_deref(), Some("2026.5.1"));
        assert_eq!(status.history, vec![42]);
        assert!(status.nodes.iter().any(|node| node.name == "plugin:github"));
        assert!(status
            .nodes
            .iter()
            .any(|node| node.name == "channel:events" && node.status == "offline"));
    }

    #[test]
    fn normalizes_session_create_from_nested_envelopes() {
        let session = normalize_session_create(&json!({
            "result": {
                "session": {
                    "session_id": "agent:coder:abc123"
                }
            }
        }))
        .unwrap();

        assert_eq!(session.id, "agent:coder:abc123");
        assert_eq!(session.status, "idle");
        assert_eq!(session.active, Some(true));
    }

    #[test]
    fn emits_chat_events_from_json_envelope() {
        let events = Arc::new(Mutex::new(Vec::new()));
        let captured = Arc::clone(&events);
        let sink: super::super::EventSink = Arc::new(move |event| {
            captured.lock().unwrap().push(event);
        });

        emit_chat_envelope(
            "session-1",
            &json!({
                "messageId": "msg-1",
                "result": {
                    "text": "hello from openclaw",
                    "meta": {
                        "tools": [
                            { "name": "bash", "command": "npm test", "status": "completed" }
                        ]
                    }
                }
            }),
            None,
            &sink,
        );

        let events = events.lock().unwrap();
        assert!(events.iter().any(|event| matches!(
            event,
            super::super::ChatEvent::Token { session_id, content, message_id }
                if session_id == "session-1" && content.contains("hello") && message_id.as_deref() == Some("msg-1")
        )));
        assert!(events.iter().any(|event| matches!(
            event,
            super::super::ChatEvent::Tool { block, .. }
                if block.kind == "terminal" && block.summary == "npm test"
        )));
    }

    #[test]
    fn emits_stream_records_with_client_message_and_activity_ids() {
        let events = Arc::new(Mutex::new(Vec::new()));
        let captured = Arc::clone(&events);
        let sink: super::super::EventSink = Arc::new(move |event| {
            captured.lock().unwrap().push(event);
        });

        emit_chat_envelope(
            "session-1",
            &json!({
                "type": "tool_update",
                "messageId": "server-msg",
                "activity_id": "tool-1",
                "name": "bash",
                "command": "npm test",
                "status": "running"
            }),
            Some("client-msg".into()),
            &sink,
        );

        let events = events.lock().unwrap();
        assert!(events.iter().any(|event| matches!(
            event,
            super::super::ChatEvent::Tool { block, message_id, activity_id, .. }
                if message_id.as_deref() == Some("client-msg")
                    && activity_id.as_deref() == Some("tool-1")
                    && block.activity_id.as_deref() == Some("tool-1")
                    && block.status == "running"
        )));
    }

    #[test]
    fn normalizes_done_stream_record_incrementally() {
        let events = normalize_chat_event(
            "session-1",
            &json!({ "type": "done", "messageId": "server-msg" }),
        )
        .unwrap();

        assert!(matches!(
            &events[0],
            super::super::ChatEvent::Done { session_id, message_id }
                if session_id == "session-1" && message_id.as_deref() == Some("server-msg")
        ));
    }

    #[test]
    fn classifies_activity_shapes() {
        assert_eq!(
            tool_block_from_event(&json!({ "name": "bash", "command": "npm test" })).kind,
            "terminal"
        );
        assert_eq!(
            tool_block_from_event(&json!({ "kind": "spawn_agent", "agentId": "explorer" })).kind,
            "subagent"
        );
        assert_eq!(
            tool_block_from_event(&json!({ "name": "read_file", "path": "src/main.rs" })).kind,
            "file"
        );
        assert_eq!(
            tool_block_from_event(&json!({ "name": "grep", "query": "ChatEvent" })).kind,
            "search"
        );
        assert_eq!(
            tool_block_from_event(&json!({ "name": "fetch", "url": "https://example.test" })).kind,
            "network"
        );
    }
}
