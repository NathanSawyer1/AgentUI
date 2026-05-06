import { describe, expect, it } from "vitest";
import { parseUnifiedPatch } from "../diffParser";

describe("parseUnifiedPatch", () => {
  it("parses modified hunks", () => {
    const rows = parseUnifiedPatch("diff --git a/a.ts b/a.ts\n@@ -1,3 +1,3 @@\n const a = 1\n-old\n+new\n done");
    expect(rows[0]).toEqual({ type: "hunk", label: "@@ -1,3 +1,3 @@" });
    expect(rows.some((row) => !("type" in row) && row.old.kind === "del" && row.old.code === "old")).toBe(true);
    expect(rows.some((row) => !("type" in row) && row.nw.kind === "add" && row.nw.code === "new")).toBe(true);
  });

  it("handles empty diffs", () => {
    expect(parseUnifiedPatch("")).toEqual([]);
  });
});
