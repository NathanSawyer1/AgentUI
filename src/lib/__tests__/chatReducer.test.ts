import { describe, it, expect } from "vitest";
import { applyChatEvent } from "../chatReducer";
import type { AgentMessage, ChatEvent, ChatMessage } from "../types";

const SESSION = "test-session";

function token(content: string): ChatEvent {
  return { session_id: SESSION, type: "token", content };
}
function tool(name: string): ChatEvent {
  return {
    session_id: SESSION,
    type: "tool",
    block: { type: "tool", status: "ok", name, summary: name, kind: "tool" },
  };
}
function start(): ChatEvent {
  return { session_id: SESSION, type: "start" };
}
function done(): ChatEvent {
  return { session_id: SESSION, type: "done" };
}
function errorMsg(err: string): ChatEvent {
  return { session_id: SESSION, type: "error", error: err };
}

function expectAgent(message: ChatMessage): AgentMessage {
  expect(message.kind).toBe("agent");
  if (message.kind !== "agent") throw new Error("expected agent message");
  return message;
}

describe("chat reducer event ordering", () => {
  it("start creates agent message with thinking block", () => {
    const result = applyChatEvent([], SESSION, start());
    expect(result).toHaveLength(1);
    expect(expectAgent(result[0]).blocks[0].type).toBe("thinking");
  });

  it("token after start appends to thinking message", () => {
    const messages: ChatMessage[] = [{ kind: "agent", time: "10:00", blocks: [{ type: "thinking" }] }];
    const result = applyChatEvent(messages, SESSION, token("hello"));
    expect(result).toHaveLength(1);
    const agent = expectAgent(result[0]);
    expect(agent.blocks).toHaveLength(1);
    expect(agent.blocks[0]).toEqual({ type: "text", content: "hello" });
  });

  it("token without prior agent creates new agent message", () => {
    const result = applyChatEvent([], SESSION, token("hello"));
    expect(result).toHaveLength(1);
    expect(expectAgent(result[0]).blocks[0]).toEqual({ type: "text", content: "hello" });
  });

  it("tool after token appends to same agent message", () => {
    const messages: ChatMessage[] = [{ kind: "agent", time: "10:00", blocks: [{ type: "text", content: "hi" }] }];
    const result = applyChatEvent(messages, SESSION, tool("bash"));
    expect(result).toHaveLength(1);
    expect(expectAgent(result[0]).blocks).toHaveLength(2);
  });

  it("tool replaces thinking block", () => {
    const messages: ChatMessage[] = [{ kind: "agent", time: "10:00", blocks: [{ type: "thinking" }] }];
    const result = applyChatEvent(messages, SESSION, tool("bash"));
    expect(result).toHaveLength(1);
    expect(expectAgent(result[0]).blocks[0].type).toBe("tool");
  });

  it("done removes thinking block", () => {
    const messages: ChatMessage[] = [{ kind: "agent", time: "10:00", blocks: [{ type: "thinking" }] }];
    const result = applyChatEvent(messages, SESSION, done());
    expect(result).toHaveLength(1);
    expect(expectAgent(result[0]).blocks).toHaveLength(0);
  });

  it("error adds text block after thinking removal", () => {
    const messages: ChatMessage[] = [{ kind: "agent", time: "10:00", blocks: [{ type: "thinking" }] }];
    const result = applyChatEvent(messages, SESSION, errorMsg("oops"));
    expect(result).toHaveLength(1);
    const blocks = expectAgent(result[0]).blocks;
    expect(blocks.some((b) => b.type === "text" && "content" in b && b.content === "oops")).toBe(true);
    expect(blocks.some((b) => b.type === "thinking")).toBe(false);
  });

  it("ignores events for other session", () => {
    const messages: ChatMessage[] = [{ kind: "agent", time: "10:00", blocks: [{ type: "thinking" }] }];
    const result = applyChatEvent(messages, "other-session", token("hello"));
    expect(result).toEqual(messages);
  });
});
