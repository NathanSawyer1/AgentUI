import type { TermLine, WorkspaceStatus } from "./types";

export function workspaceCwdLabel(workspace: WorkspaceStatus | null | undefined): string {
  return workspace?.cwd?.trim() || ".";
}

export function nextRecentCommands(current: string[], command: string, limit = 6): string[] {
  const trimmed = command.trim();
  if (!trimmed) return current.slice(0, limit);
  return [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, limit);
}

export function terminalExitLine(exitCode: number | null | undefined): TermLine {
  if (exitCode === 0) return { kind: "ok", text: "command completed successfully" };
  if (typeof exitCode === "number") return { kind: "warn", text: `command failed with exit code ${exitCode}` };
  return { kind: "warn", text: "command finished with unknown exit status" };
}
