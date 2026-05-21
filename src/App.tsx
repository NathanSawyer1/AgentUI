import { useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS } from "./lib/fixtures";
import { popoutSession, sessionCreate, settingsGet, settingsSet } from "./lib/openclaw";
import { normalizeStatusLineItems, STATUS_LINE_SHORT_LABELS } from "./lib/statusLine";
import { activeTitleFor, createPendingSession, displaySessionTitle, loadPinnedSessions, loadSessionAliases, organizeSessions, splitTitleFor, trySavePinnedSessions, trySaveSessionAliases, windowTitle } from "./lib/sessionState";
import { startDragging, minimizeWindow, toggleMaximizeWindow, closeWindow } from "./lib/windowControls";
import { useGatewayPolling, useSessionsPolling, useStatusClock, useWorkspacePolling } from "./lib/usePolling";
import type { AppSettings, GatewayStatus, SessionInfo, StatusLineItemId, StatusLineItemSetting, WorkspaceStatus } from "./lib/types";
import { SettingsModal, applySettings } from "./components/Settings";
import { Session } from "./components/Session";
import { Icon } from "./components/Icons";

function shortPath(path: string) {
  return path.replace(/^\/home\/([^/]+)/, "~").replace(/^\/Users\/([^/]+)/, "~");
}

export function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const popoutMode = searchParams.get("popout") === "1";
  const popoutSessionId = searchParams.get("sessionId") || "agent:main:main";
  const [split, setSplit] = useState(false);
  const [splitSession, setSplitSession] = useState<SessionInfo | null>(null);
  const [leftW, setLeftW] = useState(60);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [gateway, setGateway] = useState<GatewayStatus | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceStatus | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [pendingSessions, setPendingSessions] = useState<SessionInfo[]>([]);
  const [sessionAliases, setSessionAliases] = useState<Record<string, string>>(() => loadSessionAliases());
  const [pinnedSessionIds, setPinnedSessionIds] = useState<string[]>(() => loadPinnedSessions());
  const [activeSessionId, setActiveSessionId] = useState(popoutSessionId);
  const [appError, setAppError] = useState("");
  const [statusTime, setStatusTime] = useState(() => new Date());
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

  useGatewayPolling(setGateway);
  useWorkspacePolling(setWorkspace);
  useStatusClock(setStatusTime);
  useSessionsPolling(pendingSessions, popoutMode, setSessions, setActiveSessionId);

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
    if (popoutMode) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
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
  }, [split, sessions, activeSessionId, popoutMode]);

  const newSession = () => {
    const pending = createPendingSession();
    setAppError("");
    setPendingSessions((current) => [...current, pending]);
    setSessions((current) => [...current, pending]);
    setActiveSessionId(pending.id);
    void sessionCreate()
      .then((created) => {
        setPendingSessions((current) => current.filter((session) => session.id !== pending.id));
        setSessions((current) => [created, ...current.filter((session) => session.id !== pending.id && session.id !== created.id)]);
        setActiveSessionId(created.id);
      })
      .catch((error) => {
        setPendingSessions((current) => current.filter((session) => session.id !== pending.id));
        setSessions((current) => current.filter((session) => session.id !== pending.id));
        setAppError(error instanceof Error ? error.message : String(error));
      });
  };

  const navigate = (view: string) => window.dispatchEvent(new CustomEvent("agentui:navigate", { detail: view }));
  const toggleTool = (name: "diff" | "terminal") => window.dispatchEvent(new CustomEvent(`agentui:toggle-${name}`));
  const sessionGroups = organizeSessions(sessions, pinnedSessionIds);
  const paletteSessionTargets = [...sessionGroups.pinned, ...sessionGroups.recent]
    .filter((session, index, list) => list.findIndex((candidate) => candidate.id === session.id) === index)
    .slice(0, 10);
  const paletteSplitTargets = paletteSessionTargets.filter((session) => session.id !== activeSessionId).slice(0, 8);
  const sessionPaletteActions = paletteSessionTargets.map((session) => ({
    id: `session-${session.id}`,
    icon: pinnedSessionIds.includes(session.id) ? "pin" : "terminal",
    title: `Open ${displaySessionTitle(session, sessionAliases)}`,
    detail: `Switch to ${session.id}`,
    run: () => setActiveSessionId(session.id),
  }));
  const splitPaletteActions = paletteSplitTargets.map((session) => ({
    id: `split-${session.id}`,
    icon: "split",
    title: `Split with ${displaySessionTitle(session, sessionAliases)}`,
    detail: `Open ${session.id} in the secondary pane`,
    run: () => openSplitWith(session),
  }));

  const commandPaletteActions = [
    {
      id: "new-session",
      icon: "plus",
      title: "New session",
      detail: "Create a fresh OpenClaw session",
      run: newSession,
    },
    {
      id: "toggle-split",
      icon: "split",
      title: split ? "Close split" : "Open split",
      detail: "Toggle the secondary session pane",
      run: () => {
        if (split) setSplit(false);
        else {
          setSplitSession(sessions.find((x) => x.id !== activeSessionId) || sessions[1] || sessions[0]);
          setSplit(true);
        }
      },
    },
    {
      id: "settings",
      icon: "settings",
      title: "Settings",
      detail: "Open appearance, OpenClaw, and status line settings",
      run: () => setSettingsOpen(true),
    },
    {
      id: "doctor",
      icon: "cpu",
      title: "Open Doctor",
      detail: "Show OpenClaw readiness checks",
      run: () => navigate("doctor"),
    },
    {
      id: "gateway",
      icon: "layers",
      title: "Open Gateway",
      detail: "Show local gateway status",
      run: () => navigate("gateway"),
    },
    {
      id: "skills",
      icon: "tool",
      title: "Open Skills",
      detail: "Show installed and bundled skills",
      run: () => navigate("skills"),
    },
    {
      id: "plugins",
      icon: "plug",
      title: "Open Plugins",
      detail: "Show plugin registry and actions",
      run: () => navigate("plugins"),
    },
    {
      id: "logs",
      icon: "list",
      title: "Open Logs",
      detail: "Show OpenClaw logs",
      run: () => navigate("logs"),
    },
    {
      id: "chat",
      icon: "terminal",
      title: "Open Chat",
      detail: "Return to the active session chat",
      run: () => navigate("chat"),
    },
    {
      id: "toggle-diff",
      icon: "diff",
      title: "Toggle Diff",
      detail: "Open or close the worktree diff viewer",
      run: () => toggleTool("diff"),
    },
    {
      id: "toggle-terminal",
      icon: "terminal",
      title: "Toggle Terminal",
      detail: "Open or close the command runner",
      run: () => toggleTool("terminal"),
    },
    {
      id: "mock",
      icon: "cpu",
      title: settings.useMock ? "Use live OpenClaw" : "Use mock adapter",
      detail: "Switch between mock data and the configured OpenClaw binary",
      run: () => setSettings((current) => ({ ...current, useMock: !current.useMock })),
    },
    ...sessionPaletteActions,
    ...splitPaletteActions,
  ];

  const openSplitWith = (session: SessionInfo) => {
    if (popoutMode) return;
    setSplitSession(session);
    setSplit(true);
  };

  const openPopoutSession = (session: SessionInfo) => {
    void popoutSession(session, displaySessionTitle(session, sessionAliases)).catch(() => undefined);
  };

  const popoutSplitSession = (session: SessionInfo) => {
    void popoutSession(session, displaySessionTitle(session, sessionAliases))
      .then(() => setSplit(false))
      .catch(() => undefined);
  };

  const renameSession = (sessionId: string, name: string) => {
    setSessionAliases((current) => {
      const next = { ...current, [sessionId]: name };
      const error = trySaveSessionAliases(next);
      if (error) {
        setAppError(error);
        return current;
      }
      setAppError("");
      return next;
    });
  };

  const togglePinSession = (sessionId: string) => {
    setPinnedSessionIds((current) => {
      const next = current.includes(sessionId) ? current.filter((id) => id !== sessionId) : [...current, sessionId];
      const error = trySavePinnedSessions(next);
      if (error) {
        setAppError(error);
        return current;
      }
      setAppError("");
      return next;
    });
  };

  const selectSession = (session: SessionInfo) => setActiveSessionId(session.id);
  const activeTitle = activeTitleFor(activeSessionId, sessions, sessionAliases);
  const splitTitle = splitTitleFor(splitSession, sessionAliases);
  const titleSession = windowTitle(activeTitle, split, splitSession, sessionAliases);
  const statusItemValues: Record<StatusLineItemId, string> = {
    session: activeTitle,
    sessionId: activeSessionId,
    split: split && splitTitle ? splitTitle : "",
    gateway: gateway?.status ?? "fetching",
    latency: gateway ? `${gateway.latency_ms}ms` : "",
    time: statusTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    mock: settings.useMock ? "mock" : "live",
    cwd: workspace?.cwd ? shortPath(workspace.cwd) : "unknown",
    repo: workspace?.repo ?? "",
    gitBranch: workspace?.gitBranch ?? "",
    gitWorktree: workspace?.gitWorktree ?? "",
    gitChanges: typeof workspace?.gitChanges === "number" ? (workspace.gitChanges === 0 ? "clean" : `${workspace.gitChanges} changed`) : "",
    gitHead: workspace?.gitHead ?? "",
    contextWindow: "n/a",
    tokensInput: "n/a",
    tokensOutput: "n/a",
    tokensTotal: "n/a",
    fiveHourLimit: "n/a",
    weeklyLimit: "n/a",
  };
  const statusLineText = normalizeStatusLineItems(settings.statusLineItems)
    .filter((item) => item.enabled)
    .map((item) => {
      const value = statusItemValues[item.id];
      return value ? `${STATUS_LINE_SHORT_LABELS[item.id]} ${value}` : "";
    })
    .filter(Boolean)
    .join(" | ");
  const statusLineItems = normalizeStatusLineItems(settings.statusLineItems)
    .filter((item) => item.enabled)
    .map((item) => ({ id: item.id, label: STATUS_LINE_SHORT_LABELS[item.id], value: statusItemValues[item.id] }))
    .filter((item) => item.value);

  return (
    <div className="app">
      <div className="titlebar" onMouseDown={startDragging} onDoubleClick={(event) => toggleMaximizeWindow(event)}>
        <div className="tb-window-controls" onMouseDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
          <button className="tb-window-btn danger" title="Close" onMouseDown={(event) => event.stopPropagation()} onClick={closeWindow} aria-label="Close window">×</button>
          <button className="tb-window-btn" title="Maximize" onMouseDown={(event) => event.stopPropagation()} onClick={toggleMaximizeWindow} aria-label="Maximize window">□</button>
          <button className="tb-window-btn" title="Minimize" onMouseDown={(event) => event.stopPropagation()} onClick={minimizeWindow} aria-label="Minimize window">−</button>
        </div>
        <div className="tb-title">AgentUI - openclaw - {titleSession}</div>
        <div className="tb-right"><button className="kbd-hint" onClick={() => setPaletteOpen(true)} title="Open command palette">Ctrl+K</button></div>
      </div>
      <div className="workspace" ref={wrapRef}>
        {appError && <div className="error-banner app-banner">{appError}</div>}
        <div style={split ? { width: leftW + "%", display: "flex", minWidth: 0 } : { flex: 1, display: "flex", minWidth: 0 }}>
          <Session onOpenSettings={() => setSettingsOpen(true)} onSplitWith={openSplitWith} onPopoutSession={openPopoutSession} splitActive={split} paneMode={popoutMode ? "popout" : "active"} hideSidebar={popoutMode} sessionId={activeSessionId} sessions={sessions} sessionAliases={sessionAliases} pinnedSessionIds={pinnedSessionIds} onNewSession={newSession} onRenameSession={renameSession} onTogglePinSession={togglePinSession} onSessionSelect={selectSession} gateway={gateway} settings={settings} />
        </div>
        {!popoutMode && split && (
          <>
            <div className="resizer" ref={resizerRef} onMouseDown={() => { dragging.current = true; document.body.style.cursor = "col-resize"; resizerRef.current?.classList.add("dragging"); }}></div>
            <div style={{ width: 100 - leftW + "%", display: "flex", minWidth: 0 }}>
              <Session onOpenSettings={() => setSettingsOpen(true)} onPopoutSession={popoutSplitSession} onCloseSplit={() => setSplit(false)} canClose hideSidebar paneMode="split" sessionId={splitSession?.id || "new-session"} sessions={sessions} sessionAliases={sessionAliases} pinnedSessionIds={pinnedSessionIds} gateway={gateway} settings={settings} />
            </div>
          </>
        )}
      </div>
      {settings.statusLineEnabled && (
        <div className="status-line" title={statusLineText}>
          {statusLineItems.length ? statusLineItems.map((item) => (
            <span key={item.id} className="status-segment">
              <span className="status-label">{item.label}</span>
              <span className="status-value">{item.value}</span>
            </span>
          )) : <span className="status-empty">Status line empty</span>}
        </div>
      )}
      {paletteOpen && (
        <CommandPalette
          actions={commandPaletteActions}
          onClose={() => setPaletteOpen(false)}
        />
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} settings={settings} onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))} />}
    </div>
  );
}

function CommandPalette({ actions, onClose }: {
  actions: { id: string; icon: string; title: string; detail: string; run: () => void }[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const matches = actions.filter((action) => {
    const haystack = `${action.title} ${action.detail}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });
  const active = matches[Math.min(highlight, Math.max(0, matches.length - 1))];

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const runAction = (action?: typeof actions[number]) => {
    if (!action) return;
    action.run();
    onClose();
  };

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => event.stopPropagation()}>
        <div className="palette-input-wrap">
          <Icon name="search" size={15} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setHighlight(0); }}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setHighlight((index) => Math.min(matches.length - 1, index + 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setHighlight((index) => Math.max(0, index - 1));
              }
              if (event.key === "Enter") {
                event.preventDefault();
                runAction(active);
              }
            }}
            placeholder="Search commands"
          />
        </div>
        <div className="palette-list">
          {matches.length ? matches.map((action, index) => (
            <button
              key={action.id}
              className={"palette-item" + (index === highlight ? " active" : "")}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => runAction(action)}
            >
              <Icon name={action.icon} size={14} />
              <span>
                <strong>{action.title}</strong>
                <small>{action.detail}</small>
              </span>
            </button>
          )) : <div className="palette-empty">No matching commands</div>}
        </div>
      </div>
    </div>
  );
}
