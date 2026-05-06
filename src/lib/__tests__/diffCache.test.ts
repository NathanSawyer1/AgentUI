import { describe, expect, it } from "vitest";
import { activePathAfterRefresh, clearDiffCache, getDiffPatchCache, isPatchGenerationCurrent, markPatchLoading, nextPatchGeneration, prefetchCandidates, setDiffFilesCache, setDiffPatchCache } from "../diffCache";

describe("diff cache", () => {
  it("keeps the active file when refreshed files still include it", () => {
    const files = [{ path: "a.ts", adds: 1, dels: 0 }, { path: "b.ts", adds: 0, dels: 1 }];
    expect(activePathAfterRefresh("b.ts", files)).toBe("b.ts");
    expect(activePathAfterRefresh("missing.ts", files)).toBe("a.ts");
  });

  it("tracks patch generations and rejects stale responses", () => {
    clearDiffCache();
    markPatchLoading("a.ts", nextPatchGeneration("a.ts"));
    const stale = nextPatchGeneration("a.ts");
    markPatchLoading("a.ts", stale);
    expect(isPatchGenerationCurrent("a.ts", stale - 1)).toBe(false);
    expect(isPatchGenerationCurrent("a.ts", stale)).toBe(true);
  });

  it("parses and caches patches by path", () => {
    clearDiffCache();
    const record = setDiffPatchCache("a.ts", "@@ -1 +1 @@\n-old\n+new", 1);
    expect(record.rows.length).toBeGreaterThan(0);
    expect(getDiffPatchCache("a.ts")?.rows).toEqual(record.rows);
  });

  it("prefetches only uncached files after the active tab", () => {
    clearDiffCache();
    const files = [
      { path: "a.ts", adds: 1, dels: 0 },
      { path: "b.ts", adds: 1, dels: 0 },
      { path: "c.ts", adds: 1, dels: 0 },
    ];
    setDiffFilesCache(files);
    setDiffPatchCache("b.ts", "", 1);
    expect(prefetchCandidates(files, "a.ts").map((file) => file.path)).toEqual(["c.ts"]);
  });
});
