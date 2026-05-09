use super::{
    AgentCapabilities, ChatEvent, ChatSendOptions, EventSink, GatewayNode, GatewayStatus,
    HistoryMessage, OpenclawAdapter, OptionItem, PluginActionResult, PluginDependencyStatus,
    PluginItem, PluginSearchResult, SessionInfo, SkillItem, SkillMissing, SlashCommand,
    SlashCommandArg, SlashCommandArgChoice, ToolBlock,
};
use anyhow::Result;
use serde_json::json;
use std::{thread, time::Duration};

pub struct MockOpenclawAdapter;

impl MockOpenclawAdapter {
    pub fn new() -> Self {
        Self
    }
}

impl OpenclawAdapter for MockOpenclawAdapter {
    fn gateway_status(&self) -> Result<GatewayStatus> {
        let history = (0..28)
            .map(|i| (38.0 + ((i as f64 * 1.7).sin() * 0.5 + 0.5) * 95.0).round() as u64)
            .collect::<Vec<_>>();
        Ok(GatewayStatus {
            status: "online".into(),
            latency_ms: *history.last().unwrap_or(&48),
            checked_at: "2026-04-25T23:45:00Z".into(),
            version: Some("mock-0.42.0".into()),
            message: None,
            history,
            nodes: vec![
                GatewayNode {
                    name: "gateway".into(),
                    status: "online".into(),
                    latency_ms: 42,
                    last_seen: "2026-04-25T23:45:00Z".into(),
                },
                GatewayNode {
                    name: "models".into(),
                    status: "online".into(),
                    latency_ms: 58,
                    last_seen: "2026-04-25T23:45:00Z".into(),
                },
                GatewayNode {
                    name: "tools".into(),
                    status: "degraded".into(),
                    latency_ms: 142,
                    last_seen: "2026-04-25T23:45:00Z".into(),
                },
            ],
        })
    }

    fn session_create(&self, agent_id: Option<&str>) -> Result<SessionInfo> {
        let id = format!("agent:{}:mock-new", agent_id.unwrap_or("main"));
        Ok(SessionInfo {
            id: id.clone(),
            name: id,
            status: "idle".into(),
            time: "new".into(),
            active: Some(true),
            age_ms: Some(0),
            updated_at: None,
        })
    }

    fn chat(
        &self,
        session: &str,
        text: &str,
        options: ChatSendOptions,
        on_event: EventSink,
    ) -> Result<()> {
        let session_id = session.to_string();
        let prompt = text.to_string();
        let message_id = options.message_id;
        thread::spawn(move || {
            on_event(ChatEvent::Start {
                session_id: session_id.clone(),
                message_id: message_id.clone(),
            });
            let answer = format!("Mock openclaw received `{}`. Streaming is wired through Tauri events, so the real CLI can now replace this adapter.", prompt);
            for chunk in answer.split_inclusive(' ') {
                thread::sleep(Duration::from_millis(55));
                on_event(ChatEvent::Token {
                    session_id: session_id.clone(),
                    content: chunk.to_string(),
                    message_id: message_id.clone(),
                });
            }
            on_event(ChatEvent::Tool {
                session_id: session_id.clone(),
                message_id: message_id.clone(),
                activity_id: Some("mock-terminal-build".into()),
                block: ToolBlock {
                    block_type: "tool".into(),
                    id: Some("mock-terminal-build".into()),
                    activity_id: Some("mock-terminal-build".into()),
                    kind: "terminal".into(),
                    title: "Terminal".into(),
                    summary: "npm run build".into(),
                    status: "ok".into(),
                    started_at: None,
                    updated_at: None,
                    input: Some(json!({ "command": "npm run build" })),
                    output: Some(json!(
                        "vite v6.3.5 building...\n✓ 42 modules transformed\n✓ built in 812ms"
                    )),
                    error: None,
                    metadata: Some(json!({ "cwd": "~/AgentUI", "durationMs": 812, "exitCode": 0 })),
                    raw: Some(
                        json!({ "name": "bash", "command": "npm run build", "status": "ok" }),
                    ),
                    name: Some("bash".into()),
                    arg: Some("npm run build".into()),
                    preview: vec![super::PreviewLine {
                        c: Some("muted".into()),
                        t: "OPENCLAW_MOCK=1".into(),
                    }],
                },
            });
            on_event(ChatEvent::Tool {
                session_id: session_id.clone(),
                message_id: message_id.clone(),
                activity_id: Some("mock-read-settings".into()),
                block: ToolBlock {
                    block_type: "tool".into(),
                    id: Some("mock-read-settings".into()),
                    activity_id: Some("mock-read-settings".into()),
                    kind: "tool".into(),
                    title: "Tool".into(),
                    summary: "Read workspace settings".into(),
                    status: "ok".into(),
                    started_at: None,
                    updated_at: None,
                    input: Some(json!({ "path": "src/settings.rs" })),
                    output: Some(json!(
                        "Loaded SettingsStore and OpenClaw adapter configuration."
                    )),
                    error: None,
                    metadata: Some(json!({ "durationMs": 26 })),
                    raw: Some(
                        json!({ "name": "read_file", "path": "src/settings.rs", "status": "completed" }),
                    ),
                    name: Some("read_file".into()),
                    arg: Some("src/settings.rs".into()),
                    preview: vec![],
                },
            });
            on_event(ChatEvent::Tool {
                session_id: session_id.clone(),
                message_id: message_id.clone(),
                activity_id: Some("mock-subagent-explorer".into()),
                block: ToolBlock {
                    block_type: "tool".into(),
                    id: Some("mock-subagent-explorer".into()),
                    activity_id: Some("mock-subagent-explorer".into()),
                    kind: "subagent".into(),
                    title: "Subagent".into(),
                    summary: "Spawned explorer for event normalization".into(),
                    status: "running".into(),
                    started_at: Some("2026-04-25T23:45:00Z".into()),
                    updated_at: None,
                    input: Some(
                        json!({ "agent": "explorer", "task": "Inspect OpenClaw event payload examples" }),
                    ),
                    output: None,
                    error: None,
                    metadata: Some(
                        json!({ "agentId": "explorer-7", "model": "gpt-5.3-codex", "startedAt": "2026-04-25T23:45:00Z" }),
                    ),
                    raw: Some(
                        json!({ "kind": "spawn_agent", "agentId": "explorer-7", "status": "running" }),
                    ),
                    name: Some("spawn_agent".into()),
                    arg: Some("explorer".into()),
                    preview: vec![],
                },
            });
            on_event(ChatEvent::Tool {
                session_id: session_id.clone(),
                message_id: message_id.clone(),
                activity_id: Some("mock-terminal-check".into()),
                block: ToolBlock {
                    block_type: "tool".into(),
                    id: Some("mock-terminal-check".into()),
                    activity_id: Some("mock-terminal-check".into()),
                    kind: "terminal".into(),
                    title: "Terminal".into(),
                    summary: "cargo check --manifest-path src-tauri/Cargo.toml".into(),
                    status: "err".into(),
                    started_at: None,
                    updated_at: None,
                    input: Some(
                        json!({ "command": "cargo check --manifest-path src-tauri/Cargo.toml" }),
                    ),
                    output: Some(json!("Checking agentui v0.1.0")),
                    error: Some(json!(
                        "error: mock failure state for activity card rendering"
                    )),
                    metadata: Some(
                        json!({ "cwd": "~/AgentUI", "durationMs": 341, "exitCode": 101 }),
                    ),
                    raw: Some(
                        json!({ "name": "bash", "status": "failed", "stderr": "error: mock failure state for activity card rendering" }),
                    ),
                    name: Some("bash".into()),
                    arg: Some("cargo check --manifest-path src-tauri/Cargo.toml".into()),
                    preview: vec![],
                },
            });
            on_event(ChatEvent::Done {
                session_id,
                message_id,
            });
        });
        Ok(())
    }

    fn chat_cancel(&self, _session: &str) -> Result<()> {
        Ok(())
    }

    fn models_list(&self) -> Result<Vec<OptionItem>> {
        Ok(vec![
            OptionItem {
                id: "sonnet".into(),
                name: "Claude Sonnet 4.5".into(),
                meta: "mock".into(),
                desc: "Mock balanced model".into(),
                active: Some(true),
            },
            OptionItem {
                id: "gpt5".into(),
                name: "GPT-5".into(),
                meta: "mock".into(),
                desc: "Mock OpenAI model".into(),
                active: None,
            },
        ])
    }

    fn agents_list(&self) -> Result<Vec<OptionItem>> {
        Ok(vec![
            OptionItem {
                id: "main".into(),
                name: "main".into(),
                meta: "default".into(),
                desc: "Primary OpenClaw agent".into(),
                active: Some(true),
            },
            OptionItem {
                id: "coder".into(),
                name: "coder".into(),
                meta: "agent".into(),
                desc: "Coding specialist".into(),
                active: None,
            },
        ])
    }

    fn skills_list(&self) -> Result<Vec<SkillItem>> {
        Ok(vec![
            SkillItem {
                name: "spawn".into(),
                description: Some("Ephemeral subagent spawning for coder, reviewer, explore, mini, or research-lite.".into()),
                emoji: None,
                eligible: true,
                disabled: false,
                model_visible: true,
                user_invocable: true,
                command_visible: false,
                source: Some("workspace".into()),
                bundled: Some(false),
                homepage: None,
                missing: Some(SkillMissing { bins: vec![], any_bins: vec![], env: vec![], config: vec![], os: vec![] }),
            },
            SkillItem {
                name: "blogwatcher".into(),
                description: Some("Monitor blogs and RSS/Atom feeds for updates using the blogwatcher CLI.".into()),
                emoji: None,
                eligible: false,
                disabled: false,
                model_visible: false,
                user_invocable: true,
                command_visible: false,
                source: Some("openclaw-bundled".into()),
                bundled: Some(true),
                homepage: Some("https://github.com/Hyaxia/blogwatcher".into()),
                missing: Some(SkillMissing { bins: vec!["blogwatcher".into()], any_bins: vec![], env: vec![], config: vec![], os: vec![] }),
            },
            SkillItem {
                name: "weather".into(),
                description: Some("Get current weather, rain, temperature, and forecasts for locations or travel planning.".into()),
                emoji: None,
                eligible: true,
                disabled: false,
                model_visible: true,
                user_invocable: true,
                command_visible: false,
                source: Some("openclaw-bundled".into()),
                bundled: Some(true),
                homepage: None,
                missing: Some(SkillMissing { bins: vec![], any_bins: vec![], env: vec![], config: vec![], os: vec![] }),
            },
        ])
    }

    fn skill_set_enabled(&self, name: &str, enabled: bool) -> Result<Vec<SkillItem>> {
        Ok(self
            .skills_list()?
            .into_iter()
            .map(|mut skill| {
                if skill.name == name {
                    skill.disabled = !enabled;
                    skill.eligible = enabled
                        && skill
                            .missing
                            .as_ref()
                            .map(|missing| {
                                missing.bins.is_empty()
                                    && missing.any_bins.is_empty()
                                    && missing.env.is_empty()
                                    && missing.config.is_empty()
                                    && missing.os.is_empty()
                            })
                            .unwrap_or(true);
                    skill.model_visible = enabled && skill.eligible;
                }
                skill
            })
            .collect())
    }

    fn plugins_list(&self) -> Result<Vec<PluginItem>> {
        Ok(vec![
            PluginItem {
                id: "codex".into(),
                name: Some("Codex".into()),
                version: Some("2026.5.2".into()),
                description: Some(
                    "Codex app-server harness and Codex-managed GPT model catalog.".into(),
                ),
                format: Some("openclaw".into()),
                source: Some("~/.openclaw/npm/node_modules/@openclaw/codex".into()),
                root_dir: None,
                origin: Some("global".into()),
                enabled: true,
                status: Some("loaded".into()),
                tool_names: vec![],
                hook_names: vec![],
                channel_ids: vec![],
                cli_backend_ids: vec![],
                provider_ids: vec!["codex".into()],
                speech_provider_ids: vec![],
                realtime_transcription_provider_ids: vec![],
                realtime_voice_provider_ids: vec![],
                media_understanding_provider_ids: vec!["codex".into()],
                image_generation_provider_ids: vec![],
                video_generation_provider_ids: vec![],
                music_generation_provider_ids: vec![],
                web_fetch_provider_ids: vec![],
                web_search_provider_ids: vec![],
                migration_provider_ids: vec!["codex".into()],
                memory_embedding_provider_ids: vec![],
                agent_harness_ids: vec![],
                gateway_methods: vec![],
                cli_commands: vec![],
                services: vec![],
                gateway_discovery_service_ids: vec![],
                commands: vec!["codex".into()],
                http_routes: Some(0),
                hook_count: Some(0),
                dependency_status: Some(PluginDependencyStatus {
                    has_dependencies: Some(true),
                    installed: Some(true),
                    required_installed: Some(true),
                    optional_installed: Some(true),
                    missing: vec![],
                    missing_optional: vec![],
                    dependencies: vec![],
                    optional_dependencies: vec![],
                }),
                extra: serde_json::Map::new(),
            },
            PluginItem {
                id: "local-tools".into(),
                name: Some("Local Tools".into()),
                version: Some("0.4.0".into()),
                description: Some(
                    "Workspace commands and gateway hooks for local automation.".into(),
                ),
                format: Some("openclaw".into()),
                source: Some("~/.openclaw/workspace/plugins/local-tools".into()),
                root_dir: None,
                origin: Some("config".into()),
                enabled: true,
                status: Some("loaded".into()),
                tool_names: vec!["repo_status".into(), "run_task".into()],
                hook_names: vec!["session.start".into()],
                channel_ids: vec![],
                cli_backend_ids: vec![],
                provider_ids: vec![],
                speech_provider_ids: vec![],
                realtime_transcription_provider_ids: vec![],
                realtime_voice_provider_ids: vec![],
                media_understanding_provider_ids: vec![],
                image_generation_provider_ids: vec![],
                video_generation_provider_ids: vec![],
                music_generation_provider_ids: vec![],
                web_fetch_provider_ids: vec![],
                web_search_provider_ids: vec![],
                migration_provider_ids: vec![],
                memory_embedding_provider_ids: vec![],
                agent_harness_ids: vec![],
                gateway_methods: vec![],
                cli_commands: vec!["tools".into()],
                services: vec![],
                gateway_discovery_service_ids: vec![],
                commands: vec![],
                http_routes: Some(0),
                hook_count: Some(1),
                dependency_status: Some(PluginDependencyStatus {
                    has_dependencies: Some(true),
                    installed: Some(false),
                    required_installed: Some(false),
                    optional_installed: Some(true),
                    missing: vec!["zx".into()],
                    missing_optional: vec![],
                    dependencies: vec![],
                    optional_dependencies: vec![],
                }),
                extra: serde_json::Map::new(),
            },
            PluginItem {
                id: "webhooks".into(),
                name: Some("Webhooks".into()),
                version: Some("2026.5.2".into()),
                description: Some(
                    "Authenticated inbound webhooks that bind external automation to TaskFlows."
                        .into(),
                ),
                format: Some("openclaw".into()),
                source: Some("bundled".into()),
                root_dir: None,
                origin: Some("bundled".into()),
                enabled: false,
                status: Some("disabled".into()),
                tool_names: vec![],
                hook_names: vec![],
                channel_ids: vec![],
                cli_backend_ids: vec![],
                provider_ids: vec![],
                speech_provider_ids: vec![],
                realtime_transcription_provider_ids: vec![],
                realtime_voice_provider_ids: vec![],
                media_understanding_provider_ids: vec![],
                image_generation_provider_ids: vec![],
                video_generation_provider_ids: vec![],
                music_generation_provider_ids: vec![],
                web_fetch_provider_ids: vec![],
                web_search_provider_ids: vec![],
                migration_provider_ids: vec![],
                memory_embedding_provider_ids: vec![],
                agent_harness_ids: vec![],
                gateway_methods: vec![],
                cli_commands: vec![],
                services: vec!["webhooks".into()],
                gateway_discovery_service_ids: vec![],
                commands: vec![],
                http_routes: Some(2),
                hook_count: Some(0),
                dependency_status: Some(PluginDependencyStatus {
                    has_dependencies: Some(true),
                    installed: Some(true),
                    required_installed: Some(true),
                    optional_installed: Some(true),
                    missing: vec![],
                    missing_optional: vec![],
                    dependencies: vec![],
                    optional_dependencies: vec![],
                }),
                extra: serde_json::Map::new(),
            },
        ])
    }

    fn plugin_set_enabled(&self, id: &str, enabled: bool) -> Result<Vec<PluginItem>> {
        Ok(self
            .plugins_list()?
            .into_iter()
            .map(|mut plugin| {
                if plugin.id == id {
                    plugin.enabled = enabled;
                    plugin.status = Some(if enabled { "loaded" } else { "disabled" }.into());
                }
                plugin
            })
            .collect())
    }

    fn plugins_search(&self, query: &str, limit: usize) -> Result<Vec<PluginSearchResult>> {
        let needle = query.to_lowercase();
        Ok(vec![
            PluginSearchResult {
                id: "github".into(),
                name: Some("GitHub".into()),
                version: Some("1.2.0".into()),
                description: Some("Repository, issue, and pull request tools.".into()),
                spec: Some("clawhub:github".into()),
                source: Some("clawhub".into()),
                author: Some("OpenClaw".into()),
                extra: serde_json::Map::new(),
            },
            PluginSearchResult {
                id: "slack".into(),
                name: Some("Slack".into()),
                version: Some("0.8.1".into()),
                description: Some("Channel notifications and message workflows.".into()),
                spec: Some("clawhub:slack".into()),
                source: Some("clawhub".into()),
                author: Some("OpenClaw".into()),
                extra: serde_json::Map::new(),
            },
            PluginSearchResult {
                id: "linear".into(),
                name: Some("Linear".into()),
                version: Some("0.5.3".into()),
                description: Some("Issue triage and project updates.".into()),
                spec: Some("clawhub:linear".into()),
                source: Some("clawhub".into()),
                author: Some("OpenClaw".into()),
                extra: serde_json::Map::new(),
            },
        ]
        .into_iter()
        .filter(|item| {
            needle.is_empty()
                || [
                    item.id.as_str(),
                    item.name.as_deref().unwrap_or(""),
                    item.description.as_deref().unwrap_or(""),
                ]
                .join(" ")
                .to_lowercase()
                .contains(&needle)
        })
        .take(limit)
        .collect())
    }

    fn plugin_install(&self, spec: &str) -> Result<PluginActionResult> {
        Ok(PluginActionResult {
            output: format!("Installed {spec}"),
        })
    }

    fn plugin_update(&self, id: Option<&str>) -> Result<PluginActionResult> {
        Ok(PluginActionResult {
            output: id
                .map(|id| format!("Updated {id}"))
                .unwrap_or_else(|| "Updated all plugins".into()),
        })
    }

    fn plugin_uninstall_preview(&self, id: &str) -> Result<PluginActionResult> {
        Ok(PluginActionResult {
            output: format!(
                "Dry run: {id} would be removed from the plugin registry. No files changed."
            ),
        })
    }

    fn plugin_uninstall(&self, id: &str) -> Result<PluginActionResult> {
        Ok(PluginActionResult {
            output: format!("Uninstalled {id}"),
        })
    }

    fn sessions_list(&self) -> Result<Vec<SessionInfo>> {
        Ok(vec![
            SessionInfo {
                id: "agent:main:main".into(),
                name: "agent:main:main".into(),
                status: "working".into(),
                time: "mock".into(),
                active: Some(true),
                age_ms: Some(0),
                updated_at: None,
            },
            SessionInfo {
                id: "agent:coder:mock".into(),
                name: "agent:coder:mock".into(),
                status: "idle".into(),
                time: "18m".into(),
                active: None,
                age_ms: Some(18 * 60 * 1000),
                updated_at: None,
            },
        ])
    }

    fn session_history(&self, _session: &str, _limit: usize) -> Result<Vec<HistoryMessage>> {
        Ok(vec![
            HistoryMessage {
                id: Some("mock-user-1".into()),
                role: "user".into(),
                text: "Can you check this session history?".into(),
                timestamp: None,
            },
            HistoryMessage {
                id: Some("mock-assistant-1".into()),
                role: "assistant".into(),
                text: "Yep — historical messages now load when a session opens.".into(),
                timestamp: None,
            },
        ])
    }

    fn slash_commands_list(&self) -> Result<Vec<SlashCommand>> {
        Ok(vec![
            SlashCommand {
                name: "help".into(),
                native_name: Some("help".into()),
                text_aliases: vec!["/help".into()],
                description: Some("Show available commands.".into()),
                category: Some("status".into()),
                source: Some("native".into()),
                scope: Some("both".into()),
                accepts_args: false,
                args: vec![],
            },
            SlashCommand {
                name: "status".into(),
                native_name: Some("status".into()),
                text_aliases: vec!["/status".into()],
                description: Some("Show agent and session status.".into()),
                category: Some("status".into()),
                source: Some("native".into()),
                scope: Some("both".into()),
                accepts_args: false,
                args: vec![],
            },
            SlashCommand {
                name: "compact".into(),
                native_name: Some("compact".into()),
                text_aliases: vec!["/compact".into()],
                description: Some(
                    "Compact the conversation history with optional instructions.".into(),
                ),
                category: Some("session".into()),
                source: Some("native".into()),
                scope: Some("both".into()),
                accepts_args: true,
                args: vec![SlashCommandArg {
                    name: "instructions".into(),
                    description: Some("Custom compaction instructions".into()),
                    arg_type: Some("string".into()),
                    choices: vec![],
                }],
            },
            SlashCommand {
                name: "think".into(),
                native_name: Some("think".into()),
                text_aliases: vec!["/think".into()],
                description: Some("Set the thinking level for this session.".into()),
                category: Some("options".into()),
                source: Some("native".into()),
                scope: Some("both".into()),
                accepts_args: true,
                args: vec![SlashCommandArg {
                    name: "level".into(),
                    description: Some("Thinking depth".into()),
                    arg_type: Some("string".into()),
                    choices: vec![
                        SlashCommandArgChoice {
                            value: "low".into(),
                            label: Some("low".into()),
                        },
                        SlashCommandArgChoice {
                            value: "medium".into(),
                            label: Some("medium".into()),
                        },
                        SlashCommandArgChoice {
                            value: "high".into(),
                            label: Some("high".into()),
                        },
                    ],
                }],
            },
            SlashCommand {
                name: "tools".into(),
                native_name: Some("tools".into()),
                text_aliases: vec!["/tools".into()],
                description: Some("List available runtime tools.".into()),
                category: Some("status".into()),
                source: Some("native".into()),
                scope: Some("both".into()),
                accepts_args: true,
                args: vec![SlashCommandArg {
                    name: "mode".into(),
                    description: Some("compact or verbose".into()),
                    arg_type: Some("string".into()),
                    choices: vec![
                        SlashCommandArgChoice {
                            value: "compact".into(),
                            label: Some("compact".into()),
                        },
                        SlashCommandArgChoice {
                            value: "verbose".into(),
                            label: Some("verbose".into()),
                        },
                    ],
                }],
            },
            SlashCommand {
                name: "model".into(),
                native_name: Some("model".into()),
                text_aliases: vec!["/model".into()],
                description: Some("Switch the active model for this session.".into()),
                category: Some("options".into()),
                source: Some("native".into()),
                scope: Some("both".into()),
                accepts_args: true,
                args: vec![SlashCommandArg {
                    name: "model".into(),
                    description: Some("Model identifier".into()),
                    arg_type: Some("string".into()),
                    choices: vec![
                        SlashCommandArgChoice {
                            value: "claude-sonnet-4-6".into(),
                            label: Some("sonnet-4.6".into()),
                        },
                        SlashCommandArgChoice {
                            value: "claude-opus-4-7".into(),
                            label: Some("opus-4.7".into()),
                        },
                        SlashCommandArgChoice {
                            value: "claude-haiku-4-5".into(),
                            label: Some("haiku-4.5".into()),
                        },
                    ],
                }],
            },
        ])
    }

    fn agent_capabilities(&self) -> Result<AgentCapabilities> {
        Ok(AgentCapabilities {
            permission_flags: false,
            archive_session: false,
        })
    }
}
