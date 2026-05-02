import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_SETTINGS, MODELS, mockGatewayStatus, SESSIONS } from "./fixtures";
import type { AppSettings, ChatEvent, ChatSendOptions, GatewayStatus, HistoryMessage, OptionItem, SessionInfo } from "./types";

const inTauri = () => "__TAURI_INTERNALS__" in window;

export async function gatewayStatus(): Promise<GatewayStatus> {
  if (!inTauri()) return mockGatewayStatus();
  return invoke<GatewayStatus>("gateway_status");
}

export async function chatSend(sessionId: string, text: string, options: ChatSendOptions = {}): Promise<void> {
  if (!inTauri()) return;
  return invoke("chat_send", { sessionId, text, options });
}

export async function chatCancel(sessionId: string): Promise<void> {
  if (!inTauri()) return;
  return invoke("chat_cancel", { sessionId });
}

export async function modelsList(): Promise<OptionItem[]> {
  if (!inTauri()) return MODELS;
  return invoke<OptionItem[]>("models_list");
}

export async function agentsList(): Promise<OptionItem[]> {
  if (!inTauri()) {
    return [
      { id: "main", name: "main", meta: "default", desc: "Primary OpenClaw agent", active: true },
      { id: "coder", name: "coder", meta: "agent", desc: "Coding specialist" },
    ];
  }
  return invoke<OptionItem[]>("agents_list");
}

export async function sessionsList(): Promise<SessionInfo[]> {
  if (!inTauri()) return SESSIONS;
  return invoke<SessionInfo[]>("sessions_list");
}

export async function sessionHistory(sessionId: string, limit = 1000): Promise<HistoryMessage[]> {
  if (!inTauri()) {
    return [
      { role: "user", text: "Can you load this session history?" },
      { role: "assistant", text: "Yep — this is mock history for the selected session." },
    ];
  }
  return invoke<HistoryMessage[]>("session_history", { sessionId, limit });
}

export async function settingsGet(): Promise<AppSettings> {
  if (!inTauri()) return DEFAULT_SETTINGS;
  return invoke<AppSettings>("settings_get");
}

export async function settingsSet(patch: AppSettings): Promise<void> {
  if (!inTauri()) return;
  return invoke("settings_set", { patch });
}

export async function listenChat(handler: (event: ChatEvent) => void): Promise<() => void> {
  if (!inTauri()) return () => undefined;
  return listen<ChatEvent>("openclaw:chat", (event) => handler(event.payload));
}
