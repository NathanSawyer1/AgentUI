import { describe, expect, it } from "vitest";
import { appendLogLines, filterLogs, LOG_LEVEL_FILTERS, logExportFilename, logFilterSummary, logLineFromEventLine, MAX_RENDERED_LOG_LINES, mergeHydratedLogs, normalizeLogLevel, preservedLogScrollTop, shouldStickToBottom, visibleLogText } from "../logs";

describe("log helpers", () => {
  it("deduplicates appended lines and caps rendered output", () => {
    const current = Array.from({ length: MAX_RENDERED_LOG_LINES }, (_, index) => ({ text: `line ${index}` }));
    const next = appendLogLines(current, [{ text: "line 1999" }, { text: "new" }]);
    expect(next).toHaveLength(MAX_RENDERED_LOG_LINES);
    expect(next[next.length - 1]?.text).toBe("new");
    expect(next.filter((line) => line.text === "line 1999")).toHaveLength(1);
  });

  it("merges hydrated tails without duplicating overlap", () => {
    const current = [{ text: "a" }, { text: "b" }];
    const hydrated = [{ text: "b" }, { text: "c" }];
    expect(mergeHydratedLogs(current, hydrated)).toEqual([{ text: "a" }, { text: "b" }, { text: "c" }]);
  });

  it("filters by memo-friendly line and query inputs", () => {
    const lines = [{ text: "Gateway online", level: "info" }, { text: "Plugin warning", level: "warn" }];
    expect(filterLogs(lines, "plug")).toEqual([lines[1]]);
    expect(filterLogs(lines, "", "warn")).toEqual([lines[1]]);
    expect(filterLogs(lines, "")).toBe(lines);
    expect(LOG_LEVEL_FILTERS).toEqual(["all", "error", "warn", "info", "debug", "malformed"]);
  });

  it("normalizes levels and marks malformed JSON-like lines", () => {
    expect(normalizeLogLevel("WARNING")).toBe("warn");
    expect(logLineFromEventLine("{bad json", undefined, false)).toEqual({ text: "{bad json", level: "malformed", malformed: true });
    expect(logLineFromEventLine("plain line", undefined, false).malformed).toBe(false);
  });

  it("detects follow position and preserves scroll when not following", () => {
    expect(shouldStickToBottom(176, 100, 300)).toBe(false);
    expect(shouldStickToBottom(180, 100, 300)).toBe(true);
    expect(preservedLogScrollTop(120, 400, 650, false)).toBe(370);
    expect(preservedLogScrollTop(120, 400, 650, true)).toBeUndefined();
  });

  it("formats visible exports and filter summaries", () => {
    expect(visibleLogText([{ text: "one" }, { text: "two" }])).toBe("one\ntwo");
    expect(logExportFilename(new Date("2026-05-21T05:12:13.456Z"))).toBe("agentui-logs-2026-05-21T05-12-13-456Z.log");
    expect(logFilterSummary(2, 2, "", "all")).toBe("2 lines");
    expect(logFilterSummary(1, 1, "", "all")).toBe("1 line");
    expect(logFilterSummary(10, 2, "gateway", "all")).toBe("2 of 10 visible");
    expect(logFilterSummary(10, 3, "", "warn")).toBe("3 of 10 visible");
  });
});
