import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_SETTINGS, mockGatewayStatus } from "./fixtures";
import type { AppSettings, ChatEvent, GatewayStatus } from "./types";

const inTauri = () => "__TAURI_INTERNALS__" in window;

export async function gatewayStatus(): Promise<GatewayStatus> {
  if (!inTauri()) return mockGatewayStatus();
  return invoke<GatewayStatus>("gateway_status");
}

export async function chatSend(sessionId: string, text: string): Promise<void> {
  if (!inTauri()) return;
  return invoke("chat_send", { sessionId, text });
}

export async function chatCancel(sessionId: string): Promise<void> {
  if (!inTauri()) return;
  return invoke("chat_cancel", { sessionId });
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
