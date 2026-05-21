import type { SessionInfo } from "./types";

// ---------------------------------------------------------------------------
// Pane mode and identity helpers
// ---------------------------------------------------------------------------

export type PaneMode = "active" | "split" | "popout";

export interface PaneInfo {
  mode: PaneMode;
  roleLabel: string;
  title: string;
  sessionIdFull: string;
  status: SessionInfo["status"] | undefined;
  time: string | undefined;
}

export function resolvePaneInfo(
  paneMode: PaneMode,
  sessionId: string,
  sessions: SessionInfo[],
  aliases: Record<string, string>,
): PaneInfo {
  const roleLabel: Record<PaneMode, string> = {
    active: "Active",
    split: "Split",
    popout: "Popout",
  };
  const match = sessions.find((session) => session.id === sessionId || session.name === sessionId);
  const resolvedId = match?.id ?? sessionId;
  return {
    mode: paneMode,
    roleLabel: roleLabel[paneMode],
    title: sessionTitleForId(sessionId, sessions, aliases),
    sessionIdFull: resolvedId,
    status: match?.status,
    time: match?.time,
  };
}

export function paneMetaText(info: PaneInfo): string {
  return [info.status, info.time].filter(Boolean).join(" | ");
}

export function paneTooltip(info: PaneInfo): string {
  const detail = paneMetaText(info);
  return `${info.roleLabel}: ${info.title} (${info.sessionIdFull})${detail ? ` - ${detail}` : ""}`;
}

export function paneAriaLabel(info: PaneInfo): string {
  const detail = paneMetaText(info);
  return `${info.roleLabel} session ${info.title}, ${info.sessionIdFull}${detail ? `, ${detail}` : ""}`;
}

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

export function trySaveSessionAliases(aliases: Record<string, string>): string | undefined {
  try {
    saveSessionAliases(aliases);
    return undefined;
  } catch (error) {
    return storageErrorMessage(error, "rename");
  }
}

export function trySavePinnedSessions(ids: string[]): string | undefined {
  try {
    savePinnedSessions(ids);
    return undefined;
  } catch (error) {
    return storageErrorMessage(error, "pin");
  }
}

function storageErrorMessage(error: unknown, action: "rename" | "pin"): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `Could not persist session ${action}: ${detail}`;
}

export function filterSessions(sessions: SessionInfo[], query: string, aliases: Record<string, string> = {}): SessionInfo[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return sessions;
  return sessions.filter((session) => {
    const text = [
      session.id,
      session.name,
      aliases[session.id],
      session.status,
      session.time,
      session.updatedAt,
    ].filter(Boolean).join(" ").toLowerCase();
    return text.includes(needle);
  });
}

export function organizeSessions(sessions: SessionInfo[], pinnedIds: string[]) {
  const pinnedSet = new Set(pinnedIds);
  const pinned = pinnedIds.map((id) => sessions.find((session) => session.id === id)).filter((session): session is SessionInfo => Boolean(session));
  const unpinned = sessions.filter((session) => !pinnedSet.has(session.id));
  const recent = unpinned.filter(isRecentSession);
  const older = unpinned.filter((session) => !isRecentSession(session));
  return { pinned, recent, older };
}

export function isRecentSession(session: SessionInfo) {
  const age = session.ageMs ?? parseAgeLabel(session.time);
  return age == null || age <= 48 * 60 * 60 * 1000;
}

export function parseAgeLabel(label: string) {
  const text = label.trim().toLowerCase();
  if (!text || text === "mock" || text === "new") return null;
  if (text === "yest" || text === "yesterday") return 24 * 60 * 60 * 1000;
  const match = text.match(/^(\d+)\s*([smhd])$/);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2];
  if (unit === "s") return value * 1000;
  if (unit === "m") return value * 60 * 1000;
  if (unit === "h") return value * 60 * 60 * 1000;
  return value * 24 * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Session display helpers
// ---------------------------------------------------------------------------

export function displaySessionTitle(session: SessionInfo, aliases: Record<string, string>): string {
  return aliases[session.id] || session.name || session.id;
}

export function sessionTitleForId(sessionId: string, sessions: SessionInfo[], aliases: Record<string, string>): string {
  const match = sessions.find((session) => session.id === sessionId || session.name === sessionId);
  const resolvedId = match?.id ?? sessionId;
  return aliases[resolvedId] || aliases[sessionId] || match?.name || sessionId;
}

// ---------------------------------------------------------------------------
// Pending session helpers
// ---------------------------------------------------------------------------

export function createPendingSession(): SessionInfo {
  const id = crypto.randomUUID();
  return { id, name: id, status: "idle", time: "new" };
}

// ---------------------------------------------------------------------------
// Legacy title helpers (kept for compatibility)
// ---------------------------------------------------------------------------

export function activeTitleFor(
  sessionId: string,
  sessionsOrAliases: SessionInfo[] | Record<string, string>,
  aliases: Record<string, string> = {},
): string {
  if (Array.isArray(sessionsOrAliases)) {
    return sessionTitleForId(sessionId, sessionsOrAliases, aliases);
  }
  return sessionsOrAliases[sessionId] || sessionId;
}

export function splitTitleFor(session: SessionInfo | null, aliases: Record<string, string>): string {
  return session ? (aliases[session.id] || session.name) : "";
}

export function windowTitle(activeTitle: string, split: boolean, splitSession: SessionInfo | null, aliases: Record<string, string>): string {
  if (split && splitSession) {
    return `Active: ${activeTitle} | Split: ${splitTitleFor(splitSession, aliases)}`;
  }
  return activeTitle;
}
