import { describe, it, expect } from "vitest";
import { normalizeStatusLineItems, STATUS_LINE_ITEMS, STATUS_LINE_SHORT_LABELS } from "../statusLine";
import type { StatusLineItemSetting } from "../types";

describe("statusLine normalization", () => {
  it("returns all known items", () => {
    const result = normalizeStatusLineItems([]);
    expect(result.length).toBe(STATUS_LINE_ITEMS.length);
    expect(result.every((item) => STATUS_LINE_ITEMS.some((def) => def.id === item.id))).toBe(true);
  });

  it("enables default items", () => {
    const defaults = ["session", "gateway", "latency", "cwd", "gitBranch", "gitChanges", "time"];
    const result = normalizeStatusLineItems([]);
    for (const id of defaults) {
      const item = result.find((r) => r.id === id);
      expect(item?.enabled).toBe(true);
    }
  });

  it("preserves explicit enabled/disabled from input", () => {
    const items: StatusLineItemSetting[] = [
      { id: "session", enabled: false },
      { id: "gitBranch", enabled: false },
      { id: "mock", enabled: true },
    ];
    const result = normalizeStatusLineItems(items);
    expect(result.find((r) => r.id === "session")?.enabled).toBe(false);
    expect(result.find((r) => r.id === "gitBranch")?.enabled).toBe(false);
    expect(result.find((r) => r.id === "mock")?.enabled).toBe(true);
  });

  it("preserves ordering from input then appends unknowns", () => {
    const items: StatusLineItemSetting[] = [
      { id: "time", enabled: true },
      { id: "mock", enabled: true },
    ];
    const result = normalizeStatusLineItems(items);
    expect(result[0].id).toBe("time");
    expect(result[1].id).toBe("mock");
    // session (default) should come after input items
    const sessionIdx = result.findIndex((r) => r.id === "session");
    expect(sessionIdx).toBeGreaterThan(1);
  });

  it("ignores unknown item ids", () => {
    const items = [
      { id: "session", enabled: true },
      { id: "totally-made-up", enabled: true },
    ] as unknown as StatusLineItemSetting[];
    const result = normalizeStatusLineItems(items);
    expect((result as Array<{ id: string }>).some((r) => r.id === "totally-made-up")).toBe(false);
  });

  it("filters out unknown ids from input ordering", () => {
    const items = [
      { id: "totally-made-up", enabled: true },
      { id: "session", enabled: true },
    ] as unknown as StatusLineItemSetting[];
    const result = normalizeStatusLineItems(items);
    const ids = result.map((r) => r.id) as string[];
    expect(ids).not.toContain("totally-made-up");
    expect(ids[0]).toBe("session");
  });
});

describe("STATUS_LINE_SHORT_LABELS", () => {
  it("has a short label for every status line item id", () => {
    for (const item of STATUS_LINE_ITEMS) {
      expect(STATUS_LINE_SHORT_LABELS[item.id]).toBeDefined();
      expect(typeof STATUS_LINE_SHORT_LABELS[item.id]).toBe("string");
    }
  });

  it("short labels are non-empty strings", () => {
    for (const [id, label] of Object.entries(STATUS_LINE_SHORT_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
