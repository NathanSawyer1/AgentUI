use super::{ChatEvent, EventSink, GatewayNode, GatewayStatus, OpenclawAdapter, ToolBlock};
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

    fn chat(&self, session: &str, text: &str, on_event: EventSink) -> Result<()> {
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
                    arg: "openclaw chat --json".into(),
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
}
