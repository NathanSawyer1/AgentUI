import { describe, it, expect } from "vitest";
import { FULL_HISTORY_LIMIT, RECENT_HISTORY_LIMIT, clearHistoryCache, getHistoryCache, historyTime, isHistoryGenerationCurrent, mapHistoryMessage, mapHistoryMessages, mergeHistoryMessages, nextHistoryGeneration, preservedScrollTop, setHistoryCache } from "../chatHistory";
import type { AgentMessage, ChatMessage, HistoryMessage, UserMessage } from "../types";

function expectUser(message: ReturnType<typeof mapHistoryMessage>): UserMessage {
  expect(message.kind).toBe("user");
  if (message.kind !== "user") throw new Error("expected user message");
  return message;
}

function expectAgent(message: ReturnType<typeof mapHistoryMessage>): AgentMessage {
  expect(message.kind).toBe("agent");
  if (message.kind !== "agent") throw new Error("expected agent message");
  return message;
}

describe("history mapping", () => {
  it("maps user role correctly", () => {
    const msg: HistoryMessage = { id: "u1", role: "user", text: "hello", timestamp: 1712345678000 };
    const result = expectUser(mapHistoryMessage(msg, 0));
    expect(result.text).toBe("hello");
    expect(result.time).toMatch(/^\d{1,2}:\d{2}/);
  });

  it("maps assistant role to agent with text block", () => {
    const msg: HistoryMessage = { id: "a1", role: "assistant", text: "hi there", timestamp: 1712345678000 };
    const result = expectAgent(mapHistoryMessage(msg, 0));
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].type).toBe("text");
    if (result.blocks[0].type === "text") {
      expect(result.blocks[0].content).toBe("hi there");
    }
  });

  it("uses index-based fallback id when id is absent", () => {
    const user: HistoryMessage = { role: "user", text: "hi" };
    const agent: HistoryMessage = { role: "assistant", text: "hi" };
    expect(mapHistoryMessage(user, 5).id).toMatch(/^history-user-[a-z0-9]+-5$/);
    expect(mapHistoryMessage(agent, 3).id).toMatch(/^history-agent-[a-z0-9]+-3$/);
  });

  it("returns 'history' when timestamp is absent", () => {
    const msg: HistoryMessage = { role: "user", text: "hi" };
    const result = mapHistoryMessage(msg, 0);
    expect(result.time).toBe("history");
  });

  it("handles zero timestamp", () => {
    const msg: HistoryMessage = { role: "assistant", text: "hi", timestamp: 0 };
    const result = mapHistoryMessage(msg, 0);
    expect(result.time).toBe("history");
  });
});

describe("historyTime", () => {
  it("formats a millisecond timestamp", () => {
    const result = historyTime(1712345678000);
    expect(result).toMatch(/^\d{1,2}:\d{2}/);
  });

  it("returns empty string for undefined", () => {
    expect(historyTime(undefined)).toBe("");
  });
});

describe("history merge", () => {
  it("deduplicates overlapping recent messages and preserves full-history order", () => {
    const recent = mapHistoryMessages([
      { role: "user", text: "recent user", timestamp: 20 },
      { role: "assistant", text: "recent agent", timestamp: 30 },
    ]);
    const full = mapHistoryMessages([
      { role: "user", text: "older", timestamp: 10 },
      { role: "user", text: "recent user", timestamp: 20 },
      { role: "assistant", text: "recent agent", timestamp: 30 },
    ]);

    const result = mergeHistoryMessages(recent, full);

    expect(result.map((message) => message.historyKey)).toEqual([
      "user:10:older",
      "user:20:recent user",
      "assistant:30:recent agent",
    ]);
  });

  it("keeps live messages that are not in the hydrated response", () => {
    const current: ChatMessage[] = [
      ...mapHistoryMessages([{ role: "user", text: "recent", timestamp: 20 }]),
      { id: "live", kind: "agent", time: "now", blocks: [{ type: "text", content: "streaming" }] },
    ];
    const full = mapHistoryMessages([{ role: "user", text: "older", timestamp: 10 }, { role: "user", text: "recent", timestamp: 20 }]);

    const result = mergeHistoryMessages(current, full);

    expect(result.map((message) => message.id)).toEqual([full[0].id, full[1].id, "live"]);
  });
});

describe("history cache", () => {
  it("stores memory-only session records and advances generations", () => {
    clearHistoryCache();
    expect(nextHistoryGeneration("s1")).toBe(1);
    setHistoryCache("s1", { messages: [], status: "hydrating", generation: 1 });
    expect(nextHistoryGeneration("s1")).toBe(2);
    expect(getHistoryCache("s1")?.status).toBe("hydrating");
  });

  it("identifies stale responses after a newer request generation starts", () => {
    clearHistoryCache();
    setHistoryCache("s1", { messages: [], status: "initial", generation: 1 });
    setHistoryCache("s1", { messages: [], status: "initial", generation: 2 });
    expect(isHistoryGenerationCurrent("s1", 1)).toBe(false);
    expect(isHistoryGenerationCurrent("s1", 2)).toBe(true);
  });

  it("keeps the staged history limits explicit", () => {
    expect(RECENT_HISTORY_LIMIT).toBe(50);
    expect(FULL_HISTORY_LIMIT).toBe(1000);
  });
});

describe("scroll helpers", () => {
  it("preserves viewport position when older content is prepended", () => {
    expect(preservedScrollTop(120, 400, 650)).toBe(370);
  });
});
