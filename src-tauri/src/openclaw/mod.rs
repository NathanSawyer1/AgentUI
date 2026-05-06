pub mod cli;
pub mod cli_binary;
pub mod cli_normalize;
pub mod mock;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayNode {
    pub name: String,
    pub status: String,
    pub latency_ms: u64,
    pub last_seen: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayStatus {
    pub status: String,
    pub latency_ms: u64,
    pub checked_at: String,
    pub version: Option<String>,
    pub nodes: Vec<GatewayNode>,
    pub history: Vec<u64>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewLine {
    pub c: Option<String>,
    pub t: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolBlock {
    #[serde(rename = "type")]
    pub block_type: String,
    pub kind: String,
    pub title: String,
    pub summary: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arg: Option<String>,
    #[serde(default)]
    pub preview: Vec<PreviewLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ChatEvent {
    #[serde(rename = "start")]
    Start {
        session_id: String,
        message_id: Option<String>,
    },
    #[serde(rename = "token")]
    Token {
        session_id: String,
        content: String,
        message_id: Option<String>,
    },
    #[serde(rename = "tool")]
    Tool {
        session_id: String,
        block: ToolBlock,
        message_id: Option<String>,
    },
    #[serde(rename = "done")]
    Done {
        session_id: String,
        message_id: Option<String>,
    },
    #[serde(rename = "error")]
    Error {
        session_id: String,
        error: String,
        message_id: Option<String>,
    },
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ChatSendOptions {
    #[serde(rename = "agentId")]
    pub agent_id: Option<String>,
    pub model: Option<String>,
    pub thinking: Option<String>,
    pub permission: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionItem {
    pub id: String,
    pub name: String,
    pub meta: String,
    pub desc: String,
    pub active: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillMissing {
    #[serde(default)]
    pub bins: Vec<String>,
    #[serde(rename = "anyBins", default)]
    pub any_bins: Vec<String>,
    #[serde(default)]
    pub env: Vec<String>,
    #[serde(default)]
    pub config: Vec<String>,
    #[serde(default)]
    pub os: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillItem {
    pub name: String,
    pub description: Option<String>,
    pub emoji: Option<String>,
    #[serde(default)]
    pub eligible: bool,
    #[serde(default)]
    pub disabled: bool,
    #[serde(rename = "modelVisible")]
    #[serde(default)]
    pub model_visible: bool,
    #[serde(rename = "userInvocable")]
    #[serde(default)]
    pub user_invocable: bool,
    #[serde(rename = "commandVisible")]
    #[serde(default)]
    pub command_visible: bool,
    pub source: Option<String>,
    pub bundled: Option<bool>,
    pub homepage: Option<String>,
    pub missing: Option<SkillMissing>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginDependencyStatus {
    #[serde(rename = "hasDependencies")]
    pub has_dependencies: Option<bool>,
    pub installed: Option<bool>,
    #[serde(rename = "requiredInstalled")]
    pub required_installed: Option<bool>,
    #[serde(rename = "optionalInstalled")]
    pub optional_installed: Option<bool>,
    #[serde(default)]
    pub missing: Vec<String>,
    #[serde(rename = "missingOptional", default)]
    pub missing_optional: Vec<String>,
    #[serde(default)]
    pub dependencies: Vec<Value>,
    #[serde(rename = "optionalDependencies", default)]
    pub optional_dependencies: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginItem {
    pub id: String,
    pub name: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub format: Option<String>,
    pub source: Option<String>,
    #[serde(rename = "rootDir")]
    pub root_dir: Option<String>,
    pub origin: Option<String>,
    #[serde(default)]
    pub enabled: bool,
    pub status: Option<String>,
    #[serde(rename = "toolNames", default)]
    pub tool_names: Vec<String>,
    #[serde(rename = "hookNames", default)]
    pub hook_names: Vec<String>,
    #[serde(rename = "channelIds", default)]
    pub channel_ids: Vec<String>,
    #[serde(rename = "cliBackendIds", default)]
    pub cli_backend_ids: Vec<String>,
    #[serde(rename = "providerIds", default)]
    pub provider_ids: Vec<String>,
    #[serde(rename = "speechProviderIds", default)]
    pub speech_provider_ids: Vec<String>,
    #[serde(rename = "realtimeTranscriptionProviderIds", default)]
    pub realtime_transcription_provider_ids: Vec<String>,
    #[serde(rename = "realtimeVoiceProviderIds", default)]
    pub realtime_voice_provider_ids: Vec<String>,
    #[serde(rename = "mediaUnderstandingProviderIds", default)]
    pub media_understanding_provider_ids: Vec<String>,
    #[serde(rename = "imageGenerationProviderIds", default)]
    pub image_generation_provider_ids: Vec<String>,
    #[serde(rename = "videoGenerationProviderIds", default)]
    pub video_generation_provider_ids: Vec<String>,
    #[serde(rename = "musicGenerationProviderIds", default)]
    pub music_generation_provider_ids: Vec<String>,
    #[serde(rename = "webFetchProviderIds", default)]
    pub web_fetch_provider_ids: Vec<String>,
    #[serde(rename = "webSearchProviderIds", default)]
    pub web_search_provider_ids: Vec<String>,
    #[serde(rename = "migrationProviderIds", default)]
    pub migration_provider_ids: Vec<String>,
    #[serde(rename = "memoryEmbeddingProviderIds", default)]
    pub memory_embedding_provider_ids: Vec<String>,
    #[serde(rename = "agentHarnessIds", default)]
    pub agent_harness_ids: Vec<String>,
    #[serde(rename = "gatewayMethods", default)]
    pub gateway_methods: Vec<String>,
    #[serde(rename = "cliCommands", default)]
    pub cli_commands: Vec<String>,
    #[serde(default)]
    pub services: Vec<String>,
    #[serde(rename = "gatewayDiscoveryServiceIds", default)]
    pub gateway_discovery_service_ids: Vec<String>,
    #[serde(default)]
    pub commands: Vec<String>,
    #[serde(rename = "httpRoutes")]
    pub http_routes: Option<u64>,
    #[serde(rename = "hookCount")]
    pub hook_count: Option<u64>,
    #[serde(rename = "dependencyStatus")]
    pub dependency_status: Option<PluginDependencyStatus>,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginSearchResult {
    pub id: String,
    pub name: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub spec: Option<String>,
    pub source: Option<String>,
    pub author: Option<String>,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginActionResult {
    pub output: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub name: String,
    pub status: String,
    pub time: String,
    pub active: Option<bool>,
    #[serde(rename = "ageMs")]
    pub age_ms: Option<u64>,
    #[serde(rename = "updatedAt")]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentCapabilities {
    #[serde(rename = "permissionFlags")]
    pub permission_flags: bool,
    #[serde(rename = "archiveSession")]
    pub archive_session: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffFile {
    pub path: String,
    pub adds: u64,
    pub dels: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffPatch {
    pub path: String,
    pub patch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunId {
    #[serde(rename = "runId")]
    pub run_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalEvent {
    #[serde(rename = "runId")]
    pub run_id: String,
    pub stream: Option<String>,
    pub line: Option<String>,
    #[serde(rename = "exitCode")]
    pub exit_code: Option<i32>,
    pub error: Option<String>,
    pub done: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogsEvent {
    #[serde(rename = "runId")]
    pub run_id: String,
    pub line: Option<String>,
    pub record: Option<Value>,
    pub error: Option<String>,
    pub done: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryMessage {
    pub id: Option<String>,
    pub role: String,
    pub text: String,
    pub timestamp: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlashCommandArgChoice {
    pub value: String,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlashCommandArg {
    pub name: String,
    pub description: Option<String>,
    #[serde(rename = "type")]
    pub arg_type: Option<String>,
    #[serde(default)]
    pub choices: Vec<SlashCommandArgChoice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlashCommand {
    pub name: String,
    #[serde(rename = "nativeName")]
    pub native_name: Option<String>,
    #[serde(rename = "textAliases", default)]
    pub text_aliases: Vec<String>,
    pub description: Option<String>,
    pub category: Option<String>,
    pub source: Option<String>,
    pub scope: Option<String>,
    #[serde(rename = "acceptsArgs", default)]
    pub accepts_args: bool,
    #[serde(default)]
    pub args: Vec<SlashCommandArg>,
}

pub type EventSink = Arc<dyn Fn(ChatEvent) + Send + Sync + 'static>;

pub trait OpenclawAdapter: Send + Sync {
    fn gateway_status(&self) -> Result<GatewayStatus>;
    fn session_create(&self, agent_id: Option<&str>) -> Result<SessionInfo>;
    fn chat(
        &self,
        session: &str,
        text: &str,
        options: ChatSendOptions,
        on_event: EventSink,
    ) -> Result<()>;
    fn chat_cancel(&self, session: &str) -> Result<()>;
    fn models_list(&self) -> Result<Vec<OptionItem>>;
    fn agents_list(&self) -> Result<Vec<OptionItem>>;
    fn skills_list(&self) -> Result<Vec<SkillItem>>;
    fn skill_set_enabled(&self, name: &str, enabled: bool) -> Result<Vec<SkillItem>>;
    fn plugins_list(&self) -> Result<Vec<PluginItem>>;
    fn plugin_set_enabled(&self, id: &str, enabled: bool) -> Result<Vec<PluginItem>>;
    fn plugins_search(&self, query: &str, limit: usize) -> Result<Vec<PluginSearchResult>>;
    fn plugin_install(&self, spec: &str) -> Result<PluginActionResult>;
    fn plugin_update(&self, id: Option<&str>) -> Result<PluginActionResult>;
    fn plugin_uninstall_preview(&self, id: &str) -> Result<PluginActionResult>;
    fn plugin_uninstall(&self, id: &str) -> Result<PluginActionResult>;
    fn sessions_list(&self) -> Result<Vec<SessionInfo>>;
    fn session_history(&self, session: &str, limit: usize) -> Result<Vec<HistoryMessage>>;
    fn slash_commands_list(&self) -> Result<Vec<SlashCommand>>;
    fn agent_capabilities(&self) -> Result<AgentCapabilities>;
}
