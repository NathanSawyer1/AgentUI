use super::{ChatEvent, ChatSendOptions, EventSink, GatewayNode, GatewayStatus, HistoryMessage, OpenclawAdapter, OptionItem, SessionInfo, ToolBlock};
use anyhow::Result;
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
                GatewayNode { name: "gateway".into(), status: "online".into(), latency_ms: 42, last_seen: "2026-04-25T23:45:00Z".into() },
                GatewayNode { name: "models".into(), status: "online".into(), latency_ms: 58, last_seen: "2026-04-25T23:45:00Z".into() },
                GatewayNode { name: "tools".into(), status: "degraded".into(), latency_ms: 142, last_seen: "2026-04-25T23:45:00Z".into() },
            ],
        })
    }

    fn chat(&self, session: &str, text: &str, _options: ChatSendOptions, on_event: EventSink) -> Result<()> {
        let session_id = session.to_string();
        let prompt = text.to_string();
        thread::spawn(move || {
            on_event(ChatEvent::Start { session_id: session_id.clone(), message_id: None });
            let answer = format!("Mock openclaw received `{}`. Streaming is wired through Tauri events, so the real CLI can now replace this adapter.", prompt);
            for chunk in answer.split_inclusive(' ') {
                thread::sleep(Duration::from_millis(55));
                on_event(ChatEvent::Token { session_id: session_id.clone(), content: chunk.to_string(), message_id: None });
            }
            on_event(ChatEvent::Tool {
                session_id: session_id.clone(),
                message_id: None,
                block: ToolBlock {
                    block_type: "tool".into(),
                    name: "mock_gateway".into(),
                    arg: "openclaw agent --json".into(),
                    status: "ok".into(),
                    preview: vec![super::PreviewLine { c: Some("muted".into()), t: "OPENCLAW_MOCK=1".into() }],
                },
            });
            on_event(ChatEvent::Done { session_id, message_id: None });
        });
        Ok(())
    }

    fn chat_cancel(&self, _session: &str) -> Result<()> {
        Ok(())
    }

    fn models_list(&self) -> Result<Vec<OptionItem>> {
        Ok(vec![
            OptionItem { id: "sonnet".into(), name: "Claude Sonnet 4.5".into(), meta: "mock".into(), desc: "Mock balanced model".into(), active: Some(true) },
            OptionItem { id: "gpt5".into(), name: "GPT-5".into(), meta: "mock".into(), desc: "Mock OpenAI model".into(), active: None },
        ])
    }

    fn agents_list(&self) -> Result<Vec<OptionItem>> {
        Ok(vec![
            OptionItem { id: "main".into(), name: "main".into(), meta: "default".into(), desc: "Primary OpenClaw agent".into(), active: Some(true) },
            OptionItem { id: "coder".into(), name: "coder".into(), meta: "agent".into(), desc: "Coding specialist".into(), active: None },
        ])
    }

    fn sessions_list(&self) -> Result<Vec<SessionInfo>> {
        Ok(vec![
            SessionInfo { id: "agent:main:main".into(), name: "agent:main:main".into(), status: "working".into(), time: "mock".into(), active: Some(true), age_ms: Some(0), updated_at: None },
            SessionInfo { id: "agent:coder:mock".into(), name: "agent:coder:mock".into(), status: "idle".into(), time: "18m".into(), active: None, age_ms: Some(18 * 60 * 1000), updated_at: None },
        ])
    }

    fn session_history(&self, _session: &str, _limit: usize) -> Result<Vec<HistoryMessage>> {
        Ok(vec![
            HistoryMessage { id: Some("mock-user-1".into()), role: "user".into(), text: "Can you check this session history?".into(), timestamp: None },
            HistoryMessage { id: Some("mock-assistant-1".into()), role: "assistant".into(), text: "Yep — historical messages now load when a session opens.".into(), timestamp: None },
        ])
    }
}
