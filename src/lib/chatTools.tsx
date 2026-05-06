import type { JsonValue, ToolBlock } from "./types";

// ---------------------------------------------------------------------------
// Tool formatting helpers
// ---------------------------------------------------------------------------

export function toolIconFor(block: ToolBlock): string {
  const name = block.name || block.title || "";
  if (block.kind === "terminal" || name === "bash" || name === "shell") return "terminal";
  if (block.kind === "subagent") return "cpu";
  if (block.kind === "file" || name === "read_file") return "file";
  if (block.kind === "search" || name === "grep") return "search";
  if (block.kind === "network") return "plug";
  if (name === "edit_file") return "code";
  return "tool";
}

export function toolStatusIcon(block: ToolBlock): string {
  return block.status === "ok" ? "check" : block.status === "err" ? "x" : "spinner";
}

export function toolStatusLabel(block: ToolBlock): string {
  return block.status === "ok" ? "done" : block.status === "err" ? "failed" : "running";
}

export function toolStatusClass(block: ToolBlock): string {
  return block.status === "ok" ? "ok" : block.status === "err" ? "err" : "";
}

// ---------------------------------------------------------------------------
// Tool activity value formatting
// ---------------------------------------------------------------------------

export function formatActivityValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export function objectValue(value: JsonValue | undefined, key: string): JsonValue | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value[key];
}

export function stringValue(value: JsonValue | undefined): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function terminalCommand(block: ToolBlock): string {
  return stringValue(objectValue(block.input, "command"))
    || stringValue(objectValue(block.input, "cmd"))
    || stringValue(objectValue(block.raw, "command"))
    || stringValue(objectValue(block.raw, "cmd"))
    || block.arg
    || "";
}

export function subagentName(block: ToolBlock): string {
  return stringValue(objectValue(block.metadata, "agentId"))
    || stringValue(objectValue(block.metadata, "agent_id"))
    || stringValue(objectValue(block.input, "agent"))
    || stringValue(objectValue(block.input, "agentId"))
    || stringValue(objectValue(block.raw, "agentId"))
    || stringValue(objectValue(block.raw, "agent_id"))
    || block.arg
    || "";
}

export function durationLabel(block: ToolBlock): string {
  const value = objectValue(block.metadata, "durationMs")
    ?? objectValue(block.metadata, "elapsedMs")
    ?? objectValue(block.raw, "durationMs")
    ?? objectValue(block.raw, "elapsedMs");
  if (typeof value === "number") return `${value}ms`;
  return stringValue(value);
}

export function exitCodeLabel(block: ToolBlock): string {
  const value = objectValue(block.metadata, "exitCode")
    ?? objectValue(block.metadata, "exit_code")
    ?? objectValue(block.raw, "exitCode")
    ?? objectValue(block.raw, "exit_code");
  return stringValue(value);
}
