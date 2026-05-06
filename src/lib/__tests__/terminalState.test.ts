import { describe, expect, it } from "vitest";
import { nextRecentCommands, terminalExitLine, workspaceCwdLabel } from "../terminalState";

describe("terminal state", () => {
  it("uses workspace cwd when present", () => {
    expect(workspaceCwdLabel({ cwd: "/repo/app" })).toBe("/repo/app");
    expect(workspaceCwdLabel({ cwd: "   " })).toBe(".");
    expect(workspaceCwdLabel(null)).toBe(".");
  });

  it("deduplicates recent commands and keeps newest first", () => {
    expect(nextRecentCommands(["npm test", "npm run check"], "npm test")).toEqual(["npm test", "npm run check"]);
    expect(nextRecentCommands(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
  });

  it("summarizes successful and failed exits clearly", () => {
    expect(terminalExitLine(0)).toEqual({ kind: "ok", text: "command completed successfully" });
    expect(terminalExitLine(2)).toEqual({ kind: "warn", text: "command failed with exit code 2" });
    expect(terminalExitLine(null)).toEqual({ kind: "warn", text: "command finished with unknown exit status" });
  });
});
