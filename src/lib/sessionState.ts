import type { SessionInfo } from "./types";

// ---------------------------------------------------------------------------
// Session storage helpers (localStorage)
// ---------------------------------------------------------------------------

export function loadSessionAliases(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem("agentui.sessionAliases") || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function loadPinnedSessions(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem("agentui.pinnedSessions") || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function saveSessionAliases(aliases: Record<string, string>) {
  localStorage.setItem("agentui.sessionAliases", JSON.stringify(aliases));
}

export function savePinnedSessions(ids: string[]) {
  localStorage.setItem("agentui.pinnedSessions", JSON.stringify(ids));
}

// ---------------------------------------------------------------------------
// Session display helpers
// ---------------------------------------------------------------------------

export function displaySessionTitle(session: SessionInfo, aliases: Record<string, string>): string {
  return aliases[session.id] || session.name || session.id;
}

// ---------------------------------------------------------------------------
// Pending session helpers
// ---------------------------------------------------------------------------

export function createPendingSession(): SessionInfo {
  const id = crypto.randomUUID();
  return { id, name: id, status: "idle", time: "new" };
}

// ---------------------------------------------------------------------------
// Active session title helpers
// ---------------------------------------------------------------------------

export function activeTitleFor(sessionId: string, aliases: Record<string, string>): string {
  return aliases[sessionId] || sessionId;
}

export function splitTitleFor(session: SessionInfo | null, aliases: Record<string, string>): string {
  return session ? (aliases[session.id] || session.name) : "";
}

export function windowTitle(activeTitle: string, split: boolean, splitSession: SessionInfo | null, aliases: Record<string, string>): string {
  if (split && splitSession) {
    return `${activeTitle} <-> ${splitTitleFor(splitSession, aliases)}`;
  }
  return activeTitle;
}
