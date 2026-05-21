import type { TermLine, WorkspaceStatus } from "./types";

export function workspaceCwdLabel(workspace: WorkspaceStatus | null | undefined): string {
  return workspace?.cwd?.trim() || ".";
}

export function workspaceCwdInfoLine(workspace: WorkspaceStatus | null | undefined): TermLine {
  const cwd = workspaceCwdLabel(workspace);
  const repo = workspace?.repo ? ` (${workspace.repo})` : "";
  return { kind: "info", text: `workspace cwd: ${cwd}${repo}` };
}

export function nextRecentCommands(current: string[], command: string, limit = 6): string[] {
  const trimmed = command.trim();
  if (!trimmed) return current.slice(0, limit);
  return [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, limit);
}

export function terminalExitLine(exitCode: number | null | undefined, command?: string, canceled = false): TermLine {
  const label = command?.trim() ? ` \`${command.trim()}\`` : "";
  if (canceled) return { kind: "warn", text: `command${label} was canceled` };
  if (exitCode === 0) return { kind: "ok", text: `command${label} completed successfully` };
  if (typeof exitCode === "number") return { kind: "err", text: `command${label} failed with exit code ${exitCode}; review output above before rerunning` };
  return { kind: "warn", text: `command${label} finished with unknown exit status` };
}
