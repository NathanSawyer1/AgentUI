import { parseUnifiedPatch } from "./diffParser";
import type { DiffFile, DiffRow } from "./types";

export interface DiffPatchCacheRecord {
  path: string;
  patch: string;
  rows: DiffRow[];
  generation: number;
  updatedAt: number;
}

let filesCache: { files: DiffFile[]; generation: number; updatedAt: number } | undefined;
const patchCache = new Map<string, DiffPatchCacheRecord>();

export function getDiffFilesCache() {
  return filesCache ? { ...filesCache, files: filesCache.files } : undefined;
}

export function setDiffFilesCache(files: DiffFile[]) {
  filesCache = { files, generation: (filesCache?.generation ?? 0) + 1, updatedAt: Date.now() };
  return filesCache;
}

export function nextPatchGeneration(path: string): number {
  return (patchCache.get(path)?.generation ?? 0) + 1;
}

export function isPatchGenerationCurrent(path: string, generation: number): boolean {
  return patchCache.get(path)?.generation === generation;
}

export function markPatchLoading(path: string, generation: number): void {
  const current = patchCache.get(path);
  patchCache.set(path, {
    path,
    patch: current?.patch ?? "",
    rows: current?.rows ?? [],
    generation,
    updatedAt: current?.updatedAt ?? 0,
  });
}

export function getDiffPatchCache(path: string): DiffPatchCacheRecord | undefined {
  const record = patchCache.get(path);
  if (!record) return undefined;
  return { ...record, rows: record.rows };
}

export function setDiffPatchCache(path: string, patch: string, generation = nextPatchGeneration(path)): DiffPatchCacheRecord {
  const record = { path, patch, rows: parseUnifiedPatch(patch), generation, updatedAt: Date.now() };
  patchCache.set(path, record);
  return record;
}

export function activePathAfterRefresh(current: string, files: DiffFile[]): string {
  return current && files.some((file) => file.path === current) ? current : (files[0]?.path ?? "");
}

export function prefetchCandidates(files: DiffFile[], activePath: string, count = 3): DiffFile[] {
  const activeIndex = files.findIndex((file) => file.path === activePath);
  const start = activeIndex >= 0 ? activeIndex + 1 : 0;
  return files.slice(start, start + count).filter((file) => !getDiffPatchCache(file.path));
}

export function clearDiffCache(): void {
  filesCache = undefined;
  patchCache.clear();
}
