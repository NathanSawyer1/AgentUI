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
function toolUpdate(activityId: string, status: "ok" | "err" | "running"): ChatEvent {
  return {
    session_id: SESSION,
    type: "tool",
    activity_id: activityId,
    message_id: "agent-1",
    block: {
      type: "tool",
      id: activityId,
      activity_id: activityId,
      status,
      name: "bash",
      summary: status === "running" ? "npm test" : "npm test finished",
      kind: "terminal",
      input: status === "running" ? { command: "npm test" } : undefined,
      output: status === "ok" ? "passed" : undefined,
    },
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

  it("routes tokens to the matching assistant message id", () => {
    const messages: ChatMessage[] = [
      { kind: "agent", id: "agent-1", time: "10:00", blocks: [{ type: "text", content: "first " }] },
      { kind: "agent", id: "agent-2", time: "10:01", blocks: [{ type: "text", content: "second" }] },
    ];
    const result = applyChatEvent(messages, SESSION, { session_id: SESSION, type: "token", message_id: "agent-1", content: "turn" });
    expect(expectAgent(result[0]).blocks[0]).toEqual({ type: "text", content: "first turn" });
    expect(expectAgent(result[1]).blocks[0]).toEqual({ type: "text", content: "second" });
  });

  it("does not route explicit unknown message ids to the last assistant message", () => {
    const messages: ChatMessage[] = [
      { kind: "agent", id: "agent-1", time: "10:00", blocks: [{ type: "text", content: "first" }] },
    ];
    const result = applyChatEvent(messages, SESSION, { session_id: SESSION, type: "token", message_id: "agent-2", content: "second" });
    expect(result).toHaveLength(2);
    expect(expectAgent(result[0]).blocks[0]).toEqual({ type: "text", content: "first" });
    expect(expectAgent(result[1]).id).toBe("agent-2");
    expect(expectAgent(result[1]).blocks[0]).toEqual({ type: "text", content: "second" });
  });

  it("merges tool progress by activity id", () => {
    const messages: ChatMessage[] = [{ kind: "agent", id: "agent-1", time: "10:00", blocks: [{ type: "thinking" }] }];
    const running = applyChatEvent(messages, SESSION, toolUpdate("tool-1", "running"));
    const completed = applyChatEvent(running, SESSION, toolUpdate("tool-1", "ok"));
    const blocks = expectAgent(completed[0]).blocks;
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "tool",
      activity_id: "tool-1",
      status: "ok",
      input: { command: "npm test" },
      output: "passed",
    });
  });

  it("updates the matching activity when multiple tool cards are present", () => {
    const messages: ChatMessage[] = [{
      kind: "agent",
      id: "agent-1",
      time: "10:00",
      blocks: [
        { type: "tool", id: "tool-1", activity_id: "tool-1", status: "running", summary: "first", kind: "terminal" },
        { type: "tool", id: "tool-2", activity_id: "tool-2", status: "running", summary: "second", kind: "terminal" },
      ],
    }];
    const result = applyChatEvent(messages, SESSION, {
      session_id: SESSION,
      type: "tool",
      activity_id: "tool-2",
      message_id: "agent-1",
      block: {
        type: "tool",
        id: "tool-2",
        activity_id: "tool-2",
        status: "ok",
        summary: "second complete",
        kind: "terminal",
        output: "done",
      },
    });
    const blocks = expectAgent(result[0]).blocks;
    expect(blocks[0]).toMatchObject({ type: "tool", activity_id: "tool-1", status: "running", summary: "first" });
    expect(blocks[1]).toMatchObject({ type: "tool", activity_id: "tool-2", status: "ok", summary: "second complete", output: "done" });
  });

  it("done preserves failed turn state after an error", () => {
    const messages: ChatMessage[] = [{ kind: "agent", id: "agent-1", time: "10:00", blocks: [{ type: "thinking" }] }];
    const failed = applyChatEvent(messages, SESSION, { session_id: SESSION, type: "error", message_id: "agent-1", error: "boom" });
    const result = applyChatEvent(failed, SESSION, { session_id: SESSION, type: "done", message_id: "agent-1" });
    expect(expectAgent(result[0]).turnState).toBe("failed");
    expect(expectAgent(result[0]).blocks.some((block) => block.type === "thinking")).toBe(false);
  });
});
