import { useCallback, useEffect, useRef, useState } from "react";
import {
  getResourceCache,
  nextResourceGeneration,
  payloadEqual,
  setResourceCache,
  updateResourceCache,
  type ResourceCacheRecord,
} from "./memoryCache";

export interface RefreshState<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string;
  updatedAt?: number;
  isStale: boolean;
  refresh: () => void;
  setData: (value: T | ((current: T | null) => T)) => void;
  setError: (message: string) => void;
}

interface RefreshOptions<T> {
  cacheKey: string;
  load: () => Promise<T>;
  initialData?: T;
  auto?: boolean;
  intervalMs?: number;
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatUpdatedAt(updatedAt?: number): string {
  if (!updatedAt) return "not updated";
  return new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function useRefreshResource<T>({
  cacheKey,
  load,
  initialData,
  auto = true,
  intervalMs,
}: RefreshOptions<T>): RefreshState<T> {
  const cached = getResourceCache<T>(cacheKey);
  const [data, setLocalData] = useState<T | null>(cached?.data ?? initialData ?? null);
  const [meta, setMeta] = useState<ResourceCacheRecord<T> | undefined>(cached);
  const inFlight = useRef(false);
  const loadRef = useRef(load);
  loadRef.current = load;

  const setData = useCallback((value: T | ((current: T | null) => T)) => {
    setLocalData((current) => {
      const next = typeof value === "function" ? (value as (current: T | null) => T)(current) : value;
      setMeta(setResourceCache(cacheKey, {
        status: "ready",
        generation: nextResourceGeneration(cacheKey),
        updatedAt: Date.now(),
        data: next,
      }));
      return current && payloadEqual(current, next) ? current : next;
    });
  }, [cacheKey]);

  const setError = useCallback((message: string) => {
    if (!message) {
      setMeta(updateResourceCache<T>(cacheKey, {
        status: data ? "ready" : "idle",
        generation: nextResourceGeneration(cacheKey),
        error: undefined,
      }));
      return;
    }
    setMeta(updateResourceCache<T>(cacheKey, {
      status: "error",
      generation: nextResourceGeneration(cacheKey),
      error: message,
    }));
  }, [cacheKey, data]);

  const refresh = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    const generation = nextResourceGeneration(cacheKey);
    setMeta(updateResourceCache<T>(cacheKey, { status: "loading", generation, error: undefined }));
    void loadRef.current()
      .then((next) => {
        const record = setResourceCache<T>(cacheKey, {
          status: "ready",
          generation,
          updatedAt: Date.now(),
          data: next,
        });
        setMeta(record);
        setLocalData((current) => current && payloadEqual(current, next) ? current : next);
      })
      .catch((error) => {
        setMeta(updateResourceCache<T>(cacheKey, { status: "error", generation, error: errorText(error) }));
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, [cacheKey]);

  useEffect(() => {
    if (!auto) return;
    refresh();
    if (!intervalMs) return;
    const timer = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(timer);
  }, [auto, intervalMs, refresh]);

  const loading = meta?.status === "loading";
  return {
    data,
    loading: loading && !data,
    refreshing: loading && Boolean(data),
    error: meta?.status === "error" ? (meta.error ?? "") : "",
    updatedAt: meta?.updatedAt,
    isStale: meta?.status === "error" && Boolean(data),
    refresh,
    setData,
    setError,
  };
}
