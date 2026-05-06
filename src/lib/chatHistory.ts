import type { ChatMessage, HistoryMessage } from "./types";

export const RECENT_HISTORY_LIMIT = 50;
export const FULL_HISTORY_LIMIT = 1000;

export type HistoryLoadStatus = "initial" | "hydrating" | "ready" | "error";

export interface HistoryCacheRecord {
  messages: ChatMessage[];
  status: HistoryLoadStatus;
  generation: number;
}

const historyCache = new Map<string, HistoryCacheRecord>();

export function getHistoryCache(sessionId: string): HistoryCacheRecord | undefined {
  const record = historyCache.get(sessionId);
  if (!record) return undefined;
  return { ...record, messages: record.messages };
}

export function setHistoryCache(sessionId: string, record: HistoryCacheRecord): void {
  historyCache.set(sessionId, { ...record, messages: record.messages });
}

export function updateHistoryCache(sessionId: string, patch: Partial<Omit<HistoryCacheRecord, "generation">> & { generation: number }): HistoryCacheRecord {
  const current = historyCache.get(sessionId);
  const next: HistoryCacheRecord = {
    messages: patch.messages ?? current?.messages ?? [],
    status: patch.status ?? current?.status ?? "initial",
    generation: patch.generation,
  };
  setHistoryCache(sessionId, next);
  return next;
}

export function nextHistoryGeneration(sessionId: string): number {
  return (historyCache.get(sessionId)?.generation ?? 0) + 1;
}

export function isHistoryGenerationCurrent(sessionId: string, generation: number): boolean {
  return historyCache.get(sessionId)?.generation === generation;
}

export function clearHistoryCache(): void {
  historyCache.clear();
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

export function nowTime(): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

export function historyTime(timestamp?: number): string {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

// ---------------------------------------------------------------------------
// History message mapping
// ---------------------------------------------------------------------------

function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = Math.imul(31, hash) + text.charCodeAt(i) | 0;
  }
  return Math.abs(hash).toString(36);
}

function rawHistoryKey(message: HistoryMessage): string {
  return `${message.role}:${message.timestamp ?? ""}:${message.text}`;
}

export function mapHistoryMessage(message: HistoryMessage, index: number): ChatMessage {
  const time = historyTime(message.timestamp) || "history";
  const historyKey = rawHistoryKey(message);
  if (message.role === "user") {
    return { id: message.id ?? `history-user-${hashText(historyKey)}-${index}`, historyKey, kind: "user", time, text: message.text };
  }
  return { id: message.id ?? `history-agent-${hashText(historyKey)}-${index}`, historyKey, kind: "agent", time, blocks: [{ type: "text", content: message.text }] };
}

export function mapHistoryMessages(history: HistoryMessage[]): ChatMessage[] {
  return history.map(mapHistoryMessage);
}

function messageText(message: ChatMessage): string {
  if (message.kind === "user") return message.text;
  return message.blocks
    .map((block) => block.type === "text" ? block.content : block.type)
    .join("\n");
}

export function messageMergeKey(message: ChatMessage): string {
  if (message.historyKey) return `history:${message.historyKey}`;
  if (message.id) return `id:${message.id}`;
  return `fallback:${message.kind}:${message.time}:${messageText(message)}`;
}

export function mergeHistoryMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const seen = new Map<string, ChatMessage>();
  const ordered: ChatMessage[] = [];

  for (const message of incoming) {
    const key = messageMergeKey(message);
    seen.set(key, message);
    ordered.push(message);
  }

  for (const message of current) {
    const key = messageMergeKey(message);
    if (!seen.has(key)) {
      seen.set(key, message);
      ordered.push(message);
    }
  }

  return ordered;
}

export function preservedScrollTop(previousTop: number, previousHeight: number, nextHeight: number): number {
  return previousTop + Math.max(0, nextHeight - previousHeight);
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

export function agentIdFromSession(sessionId: string): string | null {
  return sessionId.match(/^agent:([^:]+):/)?.[1] ?? null;
}
