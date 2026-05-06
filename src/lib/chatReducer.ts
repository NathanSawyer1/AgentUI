import type { ChatEvent, ChatMessage } from "./types";
import { nowTime } from "./chatHistory";

// ---------------------------------------------------------------------------
// Chat event reducer
// ---------------------------------------------------------------------------

export function applyChatEvent(current: ChatMessage[], sessionId: string, event: ChatEvent): ChatMessage[] {
  if (event.session_id !== sessionId) return current;

  if (event.type === "start") {
    return [...current, { kind: "agent" as const, time: nowTime(), blocks: [{ type: "thinking" as const }] }];
  }

  const lastIdx = current.length - 1;
  const last = current[lastIdx];
  const hasAgent = last?.kind === "agent";

  if (event.type === "token") {
    const prevBlocks = hasAgent ? last.blocks.filter((b) => b.type !== "thinking") : [];
    const tail = prevBlocks[prevBlocks.length - 1];
    const newBlocks = tail?.type === "text"
      ? [...prevBlocks.slice(0, -1), { type: "text" as const, content: tail.content + event.content }]
      : [...prevBlocks, { type: "text" as const, content: event.content }];
    const msg: ChatMessage = hasAgent ? { ...last, blocks: newBlocks } : { kind: "agent", time: nowTime(), blocks: newBlocks };
    return hasAgent ? [...current.slice(0, lastIdx), msg] : [...current, msg];
  }

  if (event.type === "tool") {
    const prevBlocks = hasAgent ? last.blocks.filter((b) => b.type !== "thinking") : [];
    const newBlocks = [...prevBlocks, event.block];
    const msg: ChatMessage = hasAgent ? { ...last, blocks: newBlocks } : { kind: "agent", time: nowTime(), blocks: newBlocks };
    return hasAgent ? [...current.slice(0, lastIdx), msg] : [...current, msg];
  }

  if (event.type === "error") {
    const msg: ChatMessage = hasAgent
      ? { ...last, blocks: [...last.blocks.filter((b) => b.type !== "thinking"), { type: "text" as const, content: event.error }] }
      : { kind: "agent", time: nowTime(), blocks: [{ type: "text" as const, content: event.error }] };
    return hasAgent ? [...current.slice(0, lastIdx), msg] : [...current, msg];
  }

  if (event.type === "done") {
    if (!hasAgent) return current;
    const newBlocks = last.blocks.filter((b) => b.type !== "thinking");
    const msg: ChatMessage = { ...last, blocks: newBlocks };
    return [...current.slice(0, lastIdx), msg];
  }

  return current;
}
