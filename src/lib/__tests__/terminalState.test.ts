import { describe, expect, it } from "vitest";
import { nextRecentCommands, terminalExitLine, workspaceCwdInfoLine, workspaceCwdLabel } from "../terminalState";

describe("terminal state", () => {
  it("uses workspace cwd when present", () => {
    expect(workspaceCwdLabel({ cwd: "/repo/app" })).toBe("/repo/app");
    expect(workspaceCwdLabel({ cwd: "   " })).toBe(".");
    expect(workspaceCwdLabel(null)).toBe(".");
  });

  it("formats workspace cwd context lines", () => {
    expect(workspaceCwdInfoLine({ cwd: "/repo/app", repo: "AgentUI" })).toEqual({ kind: "info", text: "workspace cwd: /repo/app (AgentUI)" });
    expect(workspaceCwdInfoLine(null)).toEqual({ kind: "info", text: "workspace cwd: ." });
  });

  it("deduplicates recent commands and keeps newest first", () => {
    expect(nextRecentCommands(["npm test", "npm run check"], "npm test")).toEqual(["npm test", "npm run check"]);
    expect(nextRecentCommands(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
  });

  it("summarizes successful and failed exits clearly", () => {
    expect(terminalExitLine(0, "npm test")).toEqual({ kind: "ok", text: "command `npm test` completed successfully" });
    expect(terminalExitLine(2, "npm test")).toEqual({ kind: "err", text: "command `npm test` failed with exit code 2; review output above before rerunning" });
    expect(terminalExitLine(null, "npm test")).toEqual({ kind: "warn", text: "command `npm test` finished with unknown exit status" });
    expect(terminalExitLine(null, "npm test", true)).toEqual({ kind: "warn", text: "command `npm test` was canceled" });
  });
});
