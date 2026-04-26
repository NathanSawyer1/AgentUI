pub mod cli;
pub mod mock;

use anyhow::Result;
use serde::{Deserialize, Serialize};
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
    pub name: String,
    pub arg: String,
    pub status: String,
    pub preview: Vec<PreviewLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ChatEvent {
    #[serde(rename = "start")]
    Start { session_id: String, message_id: Option<String> },
    #[serde(rename = "token")]
    Token { session_id: String, content: String, message_id: Option<String> },
    #[serde(rename = "tool")]
    Tool { session_id: String, block: ToolBlock, message_id: Option<String> },
    #[serde(rename = "done")]
    Done { session_id: String, message_id: Option<String> },
    #[serde(rename = "error")]
    Error { session_id: String, error: String, message_id: Option<String> },
}

pub type EventSink = Arc<dyn Fn(ChatEvent) + Send + Sync + 'static>;

pub trait OpenclawAdapter: Send + Sync {
    fn gateway_status(&self) -> Result<GatewayStatus>;
    fn chat(&self, session: &str, text: &str, on_event: EventSink) -> Result<()>;
    fn chat_cancel(&self, session: &str) -> Result<()>;
}
