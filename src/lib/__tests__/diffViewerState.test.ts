import { describe, expect, it } from "vitest";
import { filterDiffFiles, patchTextForClipboard } from "../diffViewerState";
import type { DiffFile, DiffRow } from "../types";

describe("diff viewer state", () => {
  const files: DiffFile[] = [
    { path: "src/App.tsx", adds: 4, dels: 1 },
    { path: "assets/logo-new.png", oldPath: "assets/logo.png", adds: 0, dels: 0, binary: true },
    { path: "docs/README.md", adds: 2, dels: 0 },
  ];

  it("filters files by current and renamed paths", () => {
    expect(filterDiffFiles(files, "app").map((file) => file.path)).toEqual(["src/App.tsx"]);
    expect(filterDiffFiles(files, "logo.png").map((file) => file.path)).toEqual(["assets/logo-new.png"]);
    expect(filterDiffFiles(files, "missing")).toEqual([]);
  });

  it("returns all files for blank filters", () => {
    expect(filterDiffFiles(files, "   ")).toEqual(files);
  });

  it("prefers raw patch text when clipboard patch is cached", () => {
    expect(patchTextForClipboard("@@ -1 +1 @@\n-old\n+new", [])).toBe("@@ -1 +1 @@\n-old\n+new");
  });

  it("reconstructs readable patch text from rendered rows as a fallback", () => {
    const rows: DiffRow[] = [
      { type: "hunk", label: "@@ -1,2 +1,2 @@" },
      { old: { ln: 1, kind: "ctx", code: "same" }, nw: { ln: 1, kind: "ctx", code: "same" } },
      { old: { ln: 2, kind: "del", code: "old" }, nw: { ln: 0, kind: "ctx", code: "" } },
      { old: { ln: 0, kind: "ctx", code: "" }, nw: { ln: 2, kind: "add", code: "new" } },
    ];

    expect(patchTextForClipboard(undefined, rows)).toBe("@@ -1,2 +1,2 @@\n same\n-old\n+new");
  });

  it("uses an explicit message when no patch can be copied", () => {
    expect(patchTextForClipboard("", [])).toBe("No patch available for this file.");
  });
});
