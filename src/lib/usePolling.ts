import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef } from "react";
import type { GatewayStatus, SessionInfo, WorkspaceStatus } from "./types";
import { gatewayStatus, sessionsList, workspaceStatus } from "./openclaw";
import { getResourceCache, nextResourceGeneration, payloadEqual, setResourceCache, updateResourceCache } from "./memoryCache";

const GATEWAY_CACHE_KEY = "poll:gateway";
const WORKSPACE_CACHE_KEY = "poll:workspace";
const SESSIONS_CACHE_KEY = "poll:sessions";

// ---------------------------------------------------------------------------
// Gateway polling (5s)
// ---------------------------------------------------------------------------

export function useGatewayPolling(setGateway: Dispatch<SetStateAction<GatewayStatus | null>>) {
  const inFlight = useRef(false);
  useEffect(() => {
    const cached = getResourceCache<GatewayStatus>(GATEWAY_CACHE_KEY);
    if (cached?.data) setGateway(cached.data);
    const load = () => {
      if (inFlight.current) return;
      inFlight.current = true;
      const generation = nextResourceGeneration(GATEWAY_CACHE_KEY);
      updateResourceCache<GatewayStatus>(GATEWAY_CACHE_KEY, { status: "loading", generation });
      void gatewayStatus()
        .then((next) => {
          const current = getResourceCache<GatewayStatus>(GATEWAY_CACHE_KEY);
          if (current?.generation !== generation) return;
          setResourceCache(GATEWAY_CACHE_KEY, { status: "ready", generation, updatedAt: Date.now(), data: next });
          setGateway((currentGateway) => currentGateway && payloadEqual(currentGateway, next) ? currentGateway : next);
        })
        .catch((error) => {
          updateResourceCache<GatewayStatus>(GATEWAY_CACHE_KEY, { status: "error", generation, error: error instanceof Error ? error.message : String(error) });
        })
        .finally(() => { inFlight.current = false; });
    };
    load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, []);
}

// ---------------------------------------------------------------------------
// Workspace polling (10s)
// ---------------------------------------------------------------------------

export function useWorkspacePolling(setWorkspace: Dispatch<SetStateAction<WorkspaceStatus | null>>) {
  const inFlight = useRef(false);
  useEffect(() => {
    const cached = getResourceCache<WorkspaceStatus>(WORKSPACE_CACHE_KEY);
    if (cached?.data) setWorkspace(cached.data);
    const load = () => {
      if (inFlight.current) return;
      inFlight.current = true;
      const generation = nextResourceGeneration(WORKSPACE_CACHE_KEY);
      updateResourceCache<WorkspaceStatus>(WORKSPACE_CACHE_KEY, { status: "loading", generation });
      void workspaceStatus()
        .then((next) => {
          const current = getResourceCache<WorkspaceStatus>(WORKSPACE_CACHE_KEY);
          if (current?.generation !== generation) return;
          setResourceCache(WORKSPACE_CACHE_KEY, { status: "ready", generation, updatedAt: Date.now(), data: next });
          setWorkspace((currentWorkspace) => currentWorkspace && payloadEqual(currentWorkspace, next) ? currentWorkspace : next);
        })
        .catch((error) => {
          updateResourceCache<WorkspaceStatus>(WORKSPACE_CACHE_KEY, { status: "error", generation, error: error instanceof Error ? error.message : String(error) });
        })
        .finally(() => { inFlight.current = false; });
    };
    load();
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
  }, []);
}

// ---------------------------------------------------------------------------
// Status clock (1 minute tick)
// ---------------------------------------------------------------------------

export function useStatusClock(setStatusTime: (d: Date) => void) {
  useEffect(() => {
    const timer = window.setInterval(() => setStatusTime(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);
}

// ---------------------------------------------------------------------------
// Sessions polling (30s)
// ---------------------------------------------------------------------------

export function useSessionsPolling(
  pendingSessions: SessionInfo[],
  popoutMode: boolean,
  setSessions: Dispatch<SetStateAction<SessionInfo[]>>,
  setActiveSessionId: Dispatch<SetStateAction<string>>,
) {
  const inFlight = useRef(false);
  useEffect(() => {
    const cached = getResourceCache<SessionInfo[]>(SESSIONS_CACHE_KEY);
    if (cached?.data) setSessions((current) => payloadEqual(current, cached.data ?? []) ? current : cached.data ?? current);
    const load = () => {
      if (inFlight.current) return;
      inFlight.current = true;
      const generation = nextResourceGeneration(SESSIONS_CACHE_KEY);
      updateResourceCache<SessionInfo[]>(SESSIONS_CACHE_KEY, { status: "loading", generation });
      void sessionsList()
        .then((next) => {
          const current = getResourceCache<SessionInfo[]>(SESSIONS_CACHE_KEY);
          if (current?.generation !== generation) return;
          setResourceCache(SESSIONS_CACHE_KEY, { status: "ready", generation, updatedAt: Date.now(), data: next });
          setSessions((current) => {
            const merged = [...next];
            for (const pending of pendingSessions) {
              if (!merged.some((s) => s.id === pending.id)) merged.push(pending);
            }
            if (!merged.length) return current;
            return payloadEqual(current, merged) ? current : merged;
          });
          setActiveSessionId((current) => {
            if (popoutMode) return current;
            const merged = [...next, ...pendingSessions.filter((p) => !next.some((s) => s.id === p.id))];
            return merged.some((s) => s.id === current) ? current : (merged[0]?.id ?? current);
          });
        })
        .catch((error) => {
          updateResourceCache<SessionInfo[]>(SESSIONS_CACHE_KEY, { status: "error", generation, error: error instanceof Error ? error.message : String(error) });
        })
        .finally(() => { inFlight.current = false; });
    };
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [pendingSessions, popoutMode]);
}
