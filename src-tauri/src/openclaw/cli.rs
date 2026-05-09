use super::cli_binary::{build_command, resolve_agent_session_id, run_json, ChatThreads};
use super::cli_normalize::{
    normalize_gateway_status, normalize_history_messages, normalize_options,
    normalize_session_create, normalize_sessions, normalize_skills, value_id,
};
use super::{
    AgentCapabilities, ChatSendOptions, EventSink, GatewayStatus, HistoryMessage, OpenclawAdapter,
    OptionItem, PluginActionResult, PluginItem, PluginSearchResult, SessionInfo, SkillItem,
    SlashCommand,
};
use crate::settings::SettingsStore;
use anyhow::{anyhow, Context, Result};
use serde_json::Value;
use std::{
    collections::VecDeque,
    process::Command,
    sync::{Arc, Mutex},
};

const HISTORY_LIMIT: usize = 28;

pub struct CliOpenclawAdapter {
    settings: Arc<SettingsStore>,
    chat_threads: ChatThreads,
    latency_history: Arc<Mutex<VecDeque<u64>>>,
}

impl CliOpenclawAdapter {
    pub fn new(settings: Arc<SettingsStore>) -> Self {
        Self {
            settings,
            chat_threads: ChatThreads::new(),
            latency_history: Arc::new(Mutex::new(VecDeque::with_capacity(HISTORY_LIMIT))),
        }
    }

    fn command(&self) -> Result<Command> {
        build_command(&self.settings)
    }

    fn run_json(&self, args: &[&str]) -> Result<Value> {
        run_json(&self.settings, args)
    }

    fn resolve_agent_session_id(&self, session: &str) -> String {
        resolve_agent_session_id(&self.settings, session)
    }

    fn run_text(&self, args: &[&str], label: &str) -> Result<PluginActionResult> {
        let output = self
            .command()?
            .args(args)
            .output()
            .with_context(|| format!("failed to run `{label}`"))?;
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if !output.status.success() {
            let message = if stderr.is_empty() { stdout } else { stderr };
            return Err(anyhow!("{}", message));
        }
        let combined = match (stdout.is_empty(), stderr.is_empty()) {
            (true, true) => String::new(),
            (false, true) => stdout,
            (true, false) => stderr,
            (false, false) => format!("{stdout}\n{stderr}"),
        };
        Ok(PluginActionResult { output: combined })
    }
}

fn parse_plugins(value: Value) -> Vec<PluginItem> {
    value
        .get("plugins")
        .and_then(Value::as_array)
        .cloned()
        .or_else(|| value.as_array().cloned())
        .unwrap_or_default()
        .into_iter()
        .filter_map(|item| serde_json::from_value::<PluginItem>(item).ok())
        .collect()
}

fn parse_plugin_search_results(value: Value) -> Vec<PluginSearchResult> {
    let items = value
        .get("results")
        .or_else(|| value.get("plugins"))
        .or_else(|| value.get("items"))
        .and_then(Value::as_array)
        .cloned()
        .or_else(|| value.as_array().cloned())
        .unwrap_or_default();
    items
        .into_iter()
        .filter_map(|item| {
            let mut result = serde_json::from_value::<PluginSearchResult>(item.clone()).ok();
            if result.is_none() {
                let id = value_id(&item)?;
                result = Some(PluginSearchResult {
                    id: id.clone(),
                    name: Some(id),
                    version: None,
                    description: None,
                    spec: None,
                    source: None,
                    author: None,
                    extra: serde_json::Map::new(),
                });
            }
            result
        })
        .collect()
}

impl OpenclawAdapter for CliOpenclawAdapter {
    fn gateway_status(&self) -> Result<GatewayStatus> {
        let value = self.run_json(&["gateway", "call", "health", "--json"])?;
        Ok(normalize_gateway_status(&value, &self.latency_history))
    }

    fn session_create(&self, agent_id: Option<&str>) -> Result<SessionInfo> {
        let mut command = self.command()?;
        command.args(["agent", "--message", "", "--json"]);
        if let Some(agent_id) = agent_id.map(str::trim).filter(|value| !value.is_empty()) {
            command.args(["--agent", agent_id]);
        }
        let output = command
            .output()
            .context("failed to run `openclaw agent --message \"\" --json`")?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            return Err(anyhow!(
                "{}",
                if stderr.is_empty() { stdout } else { stderr }
            ));
        }
        let value: Value = serde_json::from_slice(&output.stdout)
            .context("failed to parse session create JSON")?;
        normalize_session_create(&value)
            .ok_or_else(|| anyhow!("openclaw did not return a session id"))
    }

    fn chat(
        &self,
        session: &str,
        text: &str,
        options: ChatSendOptions,
        on_event: EventSink,
    ) -> Result<()> {
        let agent_session_id = self.resolve_agent_session_id(session);
        let mut command = self.command()?;
        command.args([
            "agent",
            "--session-id",
            agent_session_id.as_str(),
            "--message",
            text,
            "--json",
        ]);
        if let Some(agent_id) = options.agent_id.filter(|v| !v.trim().is_empty()) {
            command.args(["--agent", agent_id.trim()]);
        }
        if let Some(model) = options.model.filter(|v| !v.trim().is_empty()) {
            command.args(["--model", model.trim()]);
        }
        if let Some(thinking) = options.thinking.filter(|v| !v.trim().is_empty()) {
            command.args(["--thinking", thinking.trim()]);
        }

        self.chat_threads
            .spawn_chat(session.to_string(), options.message_id, command, on_event);
        Ok(())
    }

    fn chat_cancel(&self, session: &str) -> Result<()> {
        let _ = self.chat_threads.kill_child(session);
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
                let fallback = vec![
                    "main".into(),
                    "coder".into(),
                    "reviewer".into(),
                    "explore".into(),
                    "mini".into(),
                    "research-lite".into(),
                ];
                let agents = self
                    .run_json(&["health", "--json"])
                    .ok()
                    .and_then(|value| {
                        value
                            .get("agents")
                            .and_then(Value::as_array)
                            .map(|items| items.iter().filter_map(value_id).collect::<Vec<_>>())
                    })
                    .filter(|items| !items.is_empty())
                    .unwrap_or(fallback);
                Ok(agents
                    .into_iter()
                    .map(|id| OptionItem {
                        id: id.clone(),
                        name: id,
                        meta: "agent".into(),
                        desc: "OpenClaw agent".into(),
                        active: None,
                    })
                    .collect())
            }
        }
    }

    fn skills_list(&self) -> Result<Vec<SkillItem>> {
        let value = self.run_json(&["skills", "list", "--json"])?;
        Ok(normalize_skills(&value))
    }

    fn skill_set_enabled(&self, name: &str, enabled: bool) -> Result<Vec<SkillItem>> {
        let batch = serde_json::json!([
            {
                "path": format!("skills.entries.{}.enabled", name),
                "value": enabled
            }
        ])
        .to_string();
        let output = self
            .command()?
            .args(["config", "set", "--batch-json", &batch])
            .output()
            .context("failed to run `openclaw config set`")?;
        if !output.status.success() {
            return Err(anyhow!(
                "{}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        self.skills_list()
    }

    fn plugins_list(&self) -> Result<Vec<PluginItem>> {
        let value = self.run_json(&["plugins", "list", "--json"])?;
        Ok(parse_plugins(value))
    }

    fn plugin_set_enabled(&self, id: &str, enabled: bool) -> Result<Vec<PluginItem>> {
        let action = if enabled { "enable" } else { "disable" };
        let output = self
            .command()?
            .args(["plugins", action, id])
            .output()
            .with_context(|| format!("failed to run `openclaw plugins {action}`"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            return Err(anyhow!(
                "{}",
                if stderr.is_empty() { stdout } else { stderr }
            ));
        }
        self.plugins_list()
    }

    fn plugins_search(&self, query: &str, limit: usize) -> Result<Vec<PluginSearchResult>> {
        let limit = limit.clamp(1, 50).to_string();
        let value = self.run_json(&["plugins", "search", "--json", "--limit", &limit, query])?;
        Ok(parse_plugin_search_results(value))
    }

    fn plugin_install(&self, spec: &str) -> Result<PluginActionResult> {
        self.run_text(&["plugins", "install", spec], "openclaw plugins install")
    }

    fn plugin_update(&self, id: Option<&str>) -> Result<PluginActionResult> {
        match id.filter(|value| !value.trim().is_empty()) {
            Some(id) => self.run_text(&["plugins", "update", id], "openclaw plugins update"),
            None => self.run_text(
                &["plugins", "update", "--all"],
                "openclaw plugins update --all",
            ),
        }
    }

    fn plugin_uninstall_preview(&self, id: &str) -> Result<PluginActionResult> {
        self.run_text(
            &["plugins", "uninstall", "--dry-run", id],
            "openclaw plugins uninstall --dry-run",
        )
    }

    fn plugin_uninstall(&self, id: &str) -> Result<PluginActionResult> {
        self.run_text(
            &["plugins", "uninstall", "--force", id],
            "openclaw plugins uninstall --force",
        )
    }

    fn sessions_list(&self) -> Result<Vec<SessionInfo>> {
        let value = self.run_json(&["sessions", "--json", "--all-agents"])?;
        Ok(normalize_sessions(&value))
    }

    fn session_history(&self, session: &str, limit: usize) -> Result<Vec<HistoryMessage>> {
        let params = serde_json::json!({ "sessionKey": session, "limit": limit }).to_string();
        let output = self
            .command()?
            .args([
                "gateway",
                "call",
                "chat.history",
                "--json",
                "--params",
                &params,
            ])
            .output()
            .context("failed to run `openclaw gateway call chat.history --json`")?;
        if !output.status.success() {
            return Err(anyhow!(
                "{}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        let value: Value =
            serde_json::from_slice(&output.stdout).context("failed to parse chat.history JSON")?;
        Ok(normalize_history_messages(&value))
    }

    fn slash_commands_list(&self) -> Result<Vec<SlashCommand>> {
        let value = self.run_json(&["gateway", "call", "commands.list", "--json"])?;
        let arr = value
            .get("commands")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        Ok(arr
            .into_iter()
            .filter_map(|v| serde_json::from_value::<SlashCommand>(v).ok())
            .filter(|c| !c.text_aliases.is_empty())
            .collect())
    }

    fn agent_capabilities(&self) -> Result<AgentCapabilities> {
        Ok(AgentCapabilities {
            permission_flags: false,
            archive_session: false,
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::openclaw::cli_normalize::*;
    use serde_json::json;
    use std::collections::VecDeque;
    use std::sync::{Arc, Mutex};

    #[test]
    fn normalize_sessions_reads_common_id_shapes() {
        let value = json!({
            "sessions": [
                { "key": "session-alpha", "ageMs": 5000 },
                { "id": "session-beta", "ageMs": 6000 },
                { "sessionId": "session-gamma", "ageMs": 7000 },
                { "session_id": "session-delta", "ageMs": 8000 }
            ]
        });
        let ids: Vec<_> = normalize_sessions(&value)
            .into_iter()
            .map(|session| session.id)
            .collect();
        assert_eq!(
            ids,
            vec![
                "session-alpha",
                "session-beta",
                "session-gamma",
                "session-delta"
            ]
        );
    }

    #[test]
    fn normalize_session_create_reads_common_envelopes() {
        for value in [
            json!({ "sessionId": "a" }),
            json!({ "session_id": "b" }),
            json!({ "sessionKey": "c" }),
            json!({ "result": { "session": { "session_key": "d" } } }),
        ] {
            assert!(normalize_session_create(&value).is_some());
        }
    }

    #[test]
    fn normalize_history_messages_filters_roles_and_extracts_text() {
        let value = json!({
            "messages": [
                { "role": "user", "text": "hello world" },
                { "role": "assistant", "content": [{ "text": "part one" }, { "text": "part two" }] },
                { "role": "system", "text": "system msg" },
                { "role": "tool", "text": "tool msg" }
            ]
        });
        let messages = normalize_history_messages(&value);
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].text, "hello world");
        assert_eq!(messages[1].text, "part one\npart two");
    }

    #[test]
    fn normalize_gateway_status_builds_plugin_and_channel_nodes() {
        let value = json!({
            "ok": true,
            "durationMs": 42,
            "plugins": { "loaded": ["plugin-a", "plugin-b"] },
            "channels": {
                "channel-1": { "ok": true },
                "channel-2": { "ok": false }
            }
        });
        let history = Arc::new(Mutex::new(VecDeque::new()));
        let status = normalize_gateway_status(&value, &history);
        assert_eq!(status.status, "online");
        assert_eq!(status.latency_ms, 42);
        assert!(status
            .nodes
            .iter()
            .any(|n| n.name == "plugin:plugin-a" && n.status == "online"));
        assert!(status
            .nodes
            .iter()
            .any(|n| n.name == "channel:channel-1" && n.status == "online"));
        assert!(status
            .nodes
            .iter()
            .any(|n| n.name == "channel:channel-2" && n.status == "offline"));
    }

    #[test]
    fn normalize_gateway_status_empty_nodes_becomes_gateway() {
        let value = json!({ "ok": false, "durationMs": 0 });
        let history = Arc::new(Mutex::new(VecDeque::new()));
        let status = normalize_gateway_status(&value, &history);
        assert_eq!(status.status, "offline");
        assert!(status
            .nodes
            .iter()
            .any(|n| n.name == "gateway" && n.status == "offline"));
    }

    #[test]
    fn tool_block_from_event_classifies_common_tool_kinds() {
        assert_eq!(
            tool_block_from_event(&json!({ "name": "bash", "command": "echo hello" })).kind,
            "terminal"
        );
        assert_eq!(
            tool_block_from_event(&json!({ "name": "delegate", "agentId": "coder" })).kind,
            "subagent"
        );
        assert_eq!(
            tool_block_from_event(&json!({ "name": "fetch", "url": "https://example.com" })).kind,
            "network"
        );
        assert_eq!(
            tool_block_from_event(&json!({ "name": "read", "path": "/tmp/file.txt" })).kind,
            "file"
        );
        assert_eq!(
            tool_block_from_event(&json!({ "name": "grep", "input": "pattern" })).kind,
            "search"
        );
    }
}
