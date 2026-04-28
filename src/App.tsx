import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS } from "./lib/fixtures";
import { gatewayStatus, sessionsList, settingsGet, settingsSet } from "./lib/openclaw";
import type { AppSettings, GatewayStatus, SessionInfo } from "./lib/types";
import { SettingsModal, applySettings } from "./components/Settings";
import { Session } from "./components/Session";

function loadSessionAliases(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem("agentui.sessionAliases") || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function loadPinnedSessions(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem("agentui.pinnedSessions") || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function App() {
  const [split, setSplit] = useState(false);
  const [splitSession, setSplitSession] = useState<SessionInfo | null>(null);
  const [leftW, setLeftW] = useState(60);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [gateway, setGateway] = useState<GatewayStatus | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [pendingSessions, setPendingSessions] = useState<SessionInfo[]>([]);
  const [sessionAliases, setSessionAliases] = useState<Record<string, string>>(() => loadSessionAliases());
  const [pinnedSessionIds, setPinnedSessionIds] = useState<string[]>(() => loadPinnedSessions());
  const [activeSessionId, setActiveSessionId] = useState("agent:main:main");
  const dragging = useRef(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const resizerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void settingsGet().then((next) => {
      setSettings(next);
      applySettings(next);
      setSettingsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    applySettings(settings);
    void settingsSet(settings).catch(() => undefined);
  }, [settings, settingsLoaded]);

  useEffect(() => {
    const load = () => void gatewayStatus().then(setGateway).catch(() => undefined);
    load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const load = () => void sessionsList().then((next) => {
      const merged = [...next];
      for (const pending of pendingSessions) {
        if (!merged.some((session) => session.id === pending.id)) merged.push(pending);
      }
      if (merged.length) {
        setSessions(merged);
        setActiveSessionId((current) => merged.some((session) => session.id === current) ? current : merged[0].id);
      }
    }).catch(() => undefined);
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [pendingSessions]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !wrapRef.current) return;
      const rect = wrapRef.current.getBoundingClientRect();
      setLeftW(Math.max(25, Math.min(75, ((e.clientX - rect.left) / rect.width) * 100)));
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      resizerRef.current?.classList.remove("dragging");
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (split) setSplit(false);
        else {
          setSplitSession(sessions.find((x) => x.id !== activeSessionId) || sessions[1] || sessions[0]);
          setSplit(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [split, sessions, activeSessionId]);

  const openSplitWith = (session: SessionInfo) => {
    setSplitSession(session);
    setSplit(true);
  };

  const newSession = () => {
    const id = crypto.randomUUID();
    const pending = { id, name: id, status: "idle" as const, time: "new", ageMs: 0 };
    setPendingSessions((current) => [...current, pending]);
    setSessions((current) => [...current, pending]);
    setActiveSessionId(id);
  };

  const renameSession = (sessionId: string, name: string) => {
    setSessionAliases((current) => {
      const next = { ...current, [sessionId]: name };
      localStorage.setItem("agentui.sessionAliases", JSON.stringify(next));
      return next;
    });
  };

  const togglePinSession = (sessionId: string) => {
    setPinnedSessionIds((current) => {
      const next = current.includes(sessionId) ? current.filter((id) => id !== sessionId) : [...current, sessionId];
      localStorage.setItem("agentui.pinnedSessions", JSON.stringify(next));
      return next;
    });
  };

  const selectSession = (session: SessionInfo) => setActiveSessionId(session.id);
  const activeTitle = sessionAliases[activeSessionId] || activeSessionId;
  const splitTitle = splitSession ? (sessionAliases[splitSession.id] || splitSession.name) : "";
  const titleSession = split && splitSession ? `${activeTitle} <-> ${splitTitle}` : activeTitle;
  const startDragging = (event: React.MouseEvent) => {
    if (event.button !== 0) return;
    void invoke("window_start_dragging").catch(() => undefined);
  };
  const minimizeWindow = (event: React.MouseEvent) => {
    event.stopPropagation();
    void invoke("window_minimize").catch(() => undefined);
  };
  const toggleMaximizeWindow = (event?: React.MouseEvent) => {
    event?.stopPropagation();
    void invoke("window_toggle_maximize").catch(() => undefined);
  };
  const closeWindow = (event: React.MouseEvent) => {
    event.stopPropagation();
    void invoke("window_close").catch(() => undefined);
  };

  return (
    <div className="app">
      <div className="titlebar" onMouseDown={startDragging} onDoubleClick={(event) => toggleMaximizeWindow(event)}>
        <div className="tb-window-controls" onMouseDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
          <button className="tb-window-btn" title="Minimize" onMouseDown={(event) => event.stopPropagation()} onClick={minimizeWindow} aria-label="Minimize window">−</button>
          <button className="tb-window-btn" title="Maximize" onMouseDown={(event) => event.stopPropagation()} onClick={toggleMaximizeWindow} aria-label="Maximize window">□</button>
          <button className="tb-window-btn danger" title="Close" onMouseDown={(event) => event.stopPropagation()} onClick={closeWindow} aria-label="Close window">×</button>
        </div>
        <div className="tb-title">AgentUI - openclaw - {titleSession}</div>
        <div className="tb-right"><span>Ctrl+K</span></div>
      </div>
      <div className="workspace" ref={wrapRef}>
        <div style={split ? { width: leftW + "%", display: "flex", minWidth: 0 } : { flex: 1, display: "flex", minWidth: 0 }}>
          <Session onOpenSettings={() => setSettingsOpen(true)} onSplitWith={openSplitWith} splitActive={split} sessionId={activeSessionId} sessions={sessions} sessionAliases={sessionAliases} pinnedSessionIds={pinnedSessionIds} onNewSession={newSession} onRenameSession={renameSession} onTogglePinSession={togglePinSession} onSessionSelect={selectSession} gateway={gateway} settings={settings} />
        </div>
        {split && (
          <>
            <div className="resizer" ref={resizerRef} onMouseDown={() => { dragging.current = true; document.body.style.cursor = "col-resize"; resizerRef.current?.classList.add("dragging"); }}></div>
            <div style={{ width: 100 - leftW + "%", display: "flex", minWidth: 0 }}>
              <Session onOpenSettings={() => setSettingsOpen(true)} onCloseSplit={() => setSplit(false)} canClose hideSidebar sessionId={splitSession?.id || "new-session"} sessions={sessions} sessionAliases={sessionAliases} pinnedSessionIds={pinnedSessionIds} gateway={gateway} settings={settings} />
            </div>
          </>
        )}
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} settings={settings} onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))} />}
    </div>
  );
}
