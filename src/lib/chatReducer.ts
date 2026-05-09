import type { ChatEvent, ChatMessage, ChatTurnState, JsonValue, MessageBlock, ToolBlock } from "./types";
import { nowTime } from "./chatHistory";

// ---------------------------------------------------------------------------
// Chat event reducer
// ---------------------------------------------------------------------------

function thinkingBlock(status: ChatTurnState = "working"): MessageBlock {
  return { type: "thinking", status, label: status };
}

function withoutThinking(blocks: MessageBlock[]): MessageBlock[] {
  return blocks.filter((block) => block.type !== "thinking");
}

function ensureThinking(blocks: MessageBlock[], status: ChatTurnState): MessageBlock[] {
  const next = blocks.map((block) => block.type === "thinking" ? thinkingBlock(status) : block);
  return next.some((block) => block.type === "thinking") ? next : [...next, thinkingBlock(status)];
}

function targetAgentIndex(current: ChatMessage[], event: ChatEvent): number {
  if (event.message_id) {
    const idx = current.findIndex((message) => message.kind === "agent" && message.id === event.message_id);
    return idx;
  }
  for (let idx = current.length - 1; idx >= 0; idx -= 1) {
    if (current[idx].kind === "agent") return idx;
  }
  return -1;
}

function activityIdFromValue(value: JsonValue | undefined): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const id = value.activity_id ?? value.activityId ?? value.tool_call_id ?? value.toolCallId ?? value.call_id ?? value.callId ?? value.id ?? value.runId;
  return typeof id === "string" && id.trim() ? id : undefined;
}

function toolBlockActivityId(block: ToolBlock): string | undefined {
  return block.activity_id
    || block.id
    || activityIdFromValue(block.metadata)
    || activityIdFromValue(block.raw);
}

function activityId(event: Extract<ChatEvent, { type: "tool" }>, block: ToolBlock): string | undefined {
  return event.activity_id || toolBlockActivityId(block);
}

function definedToolPatch(block: ToolBlock): Partial<ToolBlock> {
  return Object.fromEntries(Object.entries(block).filter(([, value]) => value !== undefined)) as Partial<ToolBlock>;
}

function mergeMetadata(previous: ToolBlock["metadata"], next: ToolBlock["metadata"]): ToolBlock["metadata"] {
  if (!previous) return next;
  if (!next) return previous;
  return { ...previous, ...next };
}

function mergeToolBlock(previous: ToolBlock, next: ToolBlock): ToolBlock {
  return {
    ...previous,
    ...definedToolPatch(next),
    input: next.input ?? previous.input,
    output: next.output ?? previous.output,
    error: next.error ?? previous.error,
    metadata: mergeMetadata(previous.metadata, next.metadata),
    raw: next.raw ?? previous.raw,
    preview: next.preview?.length ? next.preview : previous.preview,
  };
}

function upsertToolBlock(blocks: MessageBlock[], event: Extract<ChatEvent, { type: "tool" }>): MessageBlock[] {
  const incoming = { ...event.block };
  const id = activityId(event, incoming);
  if (id) {
    incoming.activity_id = incoming.activity_id ?? id;
    incoming.id = incoming.id ?? id;
  }
  if (!id) return [...blocks, incoming];

  const idx = blocks.findIndex((block) => block.type === "tool" && toolBlockActivityId(block) === id);
  if (idx < 0) return [...blocks, incoming];

  return [
    ...blocks.slice(0, idx),
    mergeToolBlock(blocks[idx] as ToolBlock, incoming),
    ...blocks.slice(idx + 1),
  ];
}

function agentMessage(current: ChatMessage[], idx: number, event: ChatEvent) {
  const existing = idx >= 0 ? current[idx] : undefined;
  return existing?.kind === "agent" ? existing : undefined;
}

export function applyChatEvent(current: ChatMessage[], sessionId: string, event: ChatEvent): ChatMessage[] {
  if (event.session_id !== sessionId) return current;

  if (event.type === "start") {
    const idx = event.message_id
      ? current.findIndex((message) => message.kind === "agent" && message.id === event.message_id)
      : -1;
    if (idx >= 0) {
      const existing = current[idx];
      if (existing.kind !== "agent") return current;
      const msg = { ...existing, turnState: "working" as const, blocks: ensureThinking(existing.blocks, "working") };
      return [...current.slice(0, idx), msg, ...current.slice(idx + 1)];
    }
    return [
      ...current,
      {
        id: event.message_id,
        kind: "agent" as const,
        time: nowTime(),
        turnState: "working" as const,
        blocks: [thinkingBlock("working")],
      },
    ];
  }

  const idx = targetAgentIndex(current, event);
  const existing = agentMessage(current, idx, event);

  if (event.type === "token") {
    const prevBlocks = existing ? withoutThinking(existing.blocks) : [];
    const tail = prevBlocks[prevBlocks.length - 1];
    const newBlocks = tail?.type === "text"
      ? [...prevBlocks.slice(0, -1), { type: "text" as const, content: tail.content + event.content }]
      : [...prevBlocks, { type: "text" as const, content: event.content }];
    const msg: ChatMessage = existing
      ? { ...existing, turnState: "working", blocks: newBlocks }
      : { id: event.message_id, kind: "agent", time: nowTime(), turnState: "working", blocks: newBlocks };
    return existing && idx >= 0 ? [...current.slice(0, idx), msg, ...current.slice(idx + 1)] : [...current, msg];
  }

  if (event.type === "tool") {
    const prevBlocks = existing ? withoutThinking(existing.blocks) : [];
    const newBlocks = upsertToolBlock(prevBlocks, event);
    const msg: ChatMessage = existing
      ? { ...existing, turnState: "working", blocks: newBlocks }
      : { id: event.message_id, kind: "agent", time: nowTime(), turnState: "working", blocks: newBlocks };
    return existing && idx >= 0 ? [...current.slice(0, idx), msg, ...current.slice(idx + 1)] : [...current, msg];
  }

  if (event.type === "error") {
    const msg: ChatMessage = existing
      ? { ...existing, turnState: "failed", blocks: [...withoutThinking(existing.blocks), { type: "text" as const, content: event.error }] }
      : { id: event.message_id, kind: "agent", time: nowTime(), turnState: "failed", blocks: [{ type: "text" as const, content: event.error }] };
    return existing && idx >= 0 ? [...current.slice(0, idx), msg, ...current.slice(idx + 1)] : [...current, msg];
  }

  if (event.type === "done") {
    if (!existing || idx < 0) return current;
    const newBlocks = withoutThinking(existing.blocks);
    const msg: ChatMessage = { ...existing, turnState: existing.turnState === "failed" ? "failed" : "complete", blocks: newBlocks };
    return [...current.slice(0, idx), msg, ...current.slice(idx + 1)];
  }

  return current;
}
