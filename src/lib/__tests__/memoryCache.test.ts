import { describe, expect, it } from "vitest";
import { clearResourceCaches, getResourceCache, isResourceGenerationCurrent, nextResourceGeneration, sameOrNext, setResourceCache, updateResourceCache } from "../memoryCache";

describe("memory resource cache", () => {
  it("stores records and advances generations in memory", () => {
    clearResourceCaches();
    expect(nextResourceGeneration("sessions")).toBe(1);
    setResourceCache("sessions", { status: "ready", generation: 1, updatedAt: 1, data: ["s1"] });
    expect(getResourceCache<string[]>("sessions")?.data).toEqual(["s1"]);
    expect(nextResourceGeneration("sessions")).toBe(2);
  });

  it("rejects stale generations after a newer refresh starts", () => {
    clearResourceCaches();
    updateResourceCache("gateway", { status: "loading", generation: 1 });
    updateResourceCache("gateway", { status: "loading", generation: 2 });
    expect(isResourceGenerationCurrent("gateway", 1)).toBe(false);
    expect(isResourceGenerationCurrent("gateway", 2)).toBe(true);
  });

  it("returns the current payload reference when next payload is unchanged", () => {
    const current = [{ id: "a", value: 1 }];
    expect(sameOrNext(current, [{ id: "a", value: 1 }])).toBe(current);
    expect(sameOrNext(current, [{ id: "a", value: 2 }])).not.toBe(current);
  });
});
