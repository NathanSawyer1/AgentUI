export type ResourceStatus = "idle" | "loading" | "ready" | "error";

export interface ResourceCacheRecord<T> {
  status: ResourceStatus;
  generation: number;
  updatedAt: number;
  data?: T;
  error?: string;
}

const resourceCache = new Map<string, ResourceCacheRecord<unknown>>();

export function getResourceCache<T>(key: string): ResourceCacheRecord<T> | undefined {
  const record = resourceCache.get(key) as ResourceCacheRecord<T> | undefined;
  if (!record) return undefined;
  return { ...record };
}

export function setResourceCache<T>(key: string, record: ResourceCacheRecord<T>): ResourceCacheRecord<T> {
  const next = { ...record, updatedAt: record.updatedAt || Date.now() };
  resourceCache.set(key, next as ResourceCacheRecord<unknown>);
  return next;
}

export function updateResourceCache<T>(key: string, patch: Partial<ResourceCacheRecord<T>>): ResourceCacheRecord<T> {
  const current = getResourceCache<T>(key);
  return setResourceCache<T>(key, {
    status: patch.status ?? current?.status ?? "idle",
    generation: patch.generation ?? current?.generation ?? 0,
    updatedAt: patch.updatedAt ?? Date.now(),
    data: patch.data ?? current?.data,
    error: patch.error,
  });
}

export function nextResourceGeneration(key: string): number {
  return (getResourceCache(key)?.generation ?? 0) + 1;
}

export function isResourceGenerationCurrent(key: string, generation: number): boolean {
  return getResourceCache(key)?.generation === generation;
}

export function payloadEqual<T>(left: T, right: T): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function sameOrNext<T>(current: T, next: T): T {
  return payloadEqual(current, next) ? current : next;
}

export function clearResourceCaches(): void {
  resourceCache.clear();
}
