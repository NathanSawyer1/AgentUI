import { describe, expect, it } from "vitest";
import { activeTitleFor, filterSessions, organizeSessions, paneAriaLabel, paneMetaText, paneTooltip, parseAgeLabel, resolvePaneInfo, sessionTitleForId, trySavePinnedSessions, trySaveSessionAliases, windowTitle } from "../sessionState";
import type { SessionInfo } from "../types";

const sessions: SessionInfo[] = [
  { id: "agent:main:one", name: "one", status: "idle", time: "1h", ageMs: 60 * 60 * 1000 },
  { id: "agent:main:two", name: "two", status: "working", time: "4d", ageMs: 4 * 24 * 60 * 60 * 1000 },
  { id: "agent:main:three", name: "three", status: "ok", time: "new" },
];

describe("session state helpers", () => {
  it("filters sessions by id, name, alias, status, and time", () => {
    expect(filterSessions(sessions, "two")).toEqual([sessions[1]]);
    expect(filterSessions(sessions, "renamed", { "agent:main:three": "Renamed Work" })).toEqual([sessions[2]]);
    expect(filterSessions(sessions, "working")).toEqual([sessions[1]]);
    expect(filterSessions(sessions, "")).toBe(sessions);
  });

  it("organizes pinned, recent, and older sessions", () => {
    expect(organizeSessions(sessions, ["agent:main:three"])).toEqual({
      pinned: [sessions[2]],
      recent: [sessions[0]],
      older: [sessions[1]],
    });
  });

  it("parses compact age labels", () => {
    expect(parseAgeLabel("15m")).toBe(15 * 60 * 1000);
    expect(parseAgeLabel("2h")).toBe(2 * 60 * 60 * 1000);
    expect(parseAgeLabel("yesterday")).toBe(24 * 60 * 60 * 1000);
    expect(parseAgeLabel("new")).toBeNull();
  });

  it("reports localStorage write failures without throwing", () => {
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { setItem: () => { throw new Error("quota"); } },
    });
    try {
      expect(trySaveSessionAliases({ "agent:main:one": "One" })).toContain("rename");
      expect(trySavePinnedSessions(["agent:main:one"])).toContain("pin");
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: original,
      });
    }
  });

  it("resolves pane identity with alias, name, and id fallbacks", () => {
    expect(resolvePaneInfo("active", "agent:main:one", sessions, { "agent:main:one": "Alias One" })).toMatchObject({
      mode: "active",
      roleLabel: "Active",
      title: "Alias One",
      sessionIdFull: "agent:main:one",
      status: "idle",
      time: "1h",
    });
    expect(resolvePaneInfo("split", "agent:main:two", sessions, {})).toMatchObject({
      mode: "split",
      roleLabel: "Split",
      title: "two",
      sessionIdFull: "agent:main:two",
      status: "working",
      time: "4d",
    });
    expect(resolvePaneInfo("popout", "agent:main:missing", sessions, {})).toEqual({
      mode: "popout",
      roleLabel: "Popout",
      title: "agent:main:missing",
      sessionIdFull: "agent:main:missing",
      status: undefined,
      time: undefined,
    });
  });

  it("builds consistent pane text for title, tooltip, and aria labels", () => {
    const info = resolvePaneInfo("split", "agent:main:two", sessions, { "agent:main:two": "Review Split" });
    expect(paneMetaText(info)).toBe("working | 4d");
    expect(paneTooltip(info)).toBe("Split: Review Split (agent:main:two) - working | 4d");
    expect(paneAriaLabel(info)).toBe("Split session Review Split, agent:main:two, working | 4d");
  });

  it("resolves session titles from aliases, names, and ids", () => {
    expect(sessionTitleForId("agent:main:one", sessions, { "agent:main:one": "Alias One" })).toBe("Alias One");
    expect(sessionTitleForId("agent:main:two", sessions, {})).toBe("two");
    expect(sessionTitleForId("agent:main:missing", sessions, {})).toBe("agent:main:missing");
    expect(activeTitleFor("agent:main:one", sessions, {})).toBe("one");
    expect(activeTitleFor("agent:main:one", { "agent:main:one": "Legacy Alias" })).toBe("Legacy Alias");
    expect(windowTitle("one", true, sessions[1], {})).toBe("Active: one | Split: two");
  });
});
