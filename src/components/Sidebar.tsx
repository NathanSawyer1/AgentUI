import { useEffect, useState } from "react";
import type { GatewayStatus, SessionInfo } from "../lib/types";
import { Icon } from "./Icons";

export type NavView = "chat" | "gateway" | "skills" | "plugins" | "logs" | "doctor";

type SessionAliases = Record<string, string>;

export function Sidebar({ onOpenSettings, onSplitWith, onPopoutSession, splitActive, onCollapse, activeView, onViewChange, gateway, activeSessionId, sessions, sessionAliases, pinnedSessionIds, onNewSession, onRenameSession, onTogglePinSession, onSessionSelect }: {
  onOpenSettings: () => void;
  onSplitWith?: (session: SessionInfo) => void;
  onPopoutSession?: (session: SessionInfo) => void;
  splitActive?: boolean;
  onCollapse?: () => void;
  activeView: NavView;
  onViewChange: (view: NavView) => void;
  gateway: GatewayStatus | null;
  activeSessionId: string;
  sessions: SessionInfo[];
  sessionAliases: SessionAliases;
  pinnedSessionIds: string[];
  onNewSession?: () => void;
  onRenameSession?: (sessionId: string, name: string) => void;
  onTogglePinSession?: (sessionId: string) => void;
  onSessionSelect?: (session: SessionInfo) => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number; session: SessionInfo } | null>(null);
  const [showOlder, setShowOlder] = useState(false);
  const bars = gateway?.history ?? Array.from({ length: 28 }, () => 14);
  const pinnedSet = new Set(pinnedSessionIds);
  const pinnedSessions = pinnedSessionIds.map((id) => sessions.find((session) => session.id === id)).filter((session): session is SessionInfo => Boolean(session));
  const unpinnedSessions = sessions.filter((session) => !pinnedSet.has(session.id));
  const recentSessions = unpinnedSessions.filter(isRecentSession);
  const olderSessions = unpinnedSessions.filter((session) => !isRecentSession(session));

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const nav = (view: NavView, icon: string, label: string) => (
    <div className={"sb-nav" + (activeView === view ? " active" : "")} onClick={() => onViewChange(view)}>
      <Icon name={icon} /><span>{label}</span>
    </div>
  );

  const renderSession = (s: SessionInfo) => (
    <div key={s.id} className={"sb-item" + (activeSessionId === s.id || activeSessionId === s.name ? " active" : "")} onClick={() => { onSessionSelect?.(s); onViewChange("chat"); }} onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, session: s }); }}>
      <span className={"sb-dot " + s.status}></span>
      <span className="sb-item-text" title={s.name}>{displaySessionName(s, sessionAliases)}</span>
      <span className="sb-item-meta">{s.time}</span>
    </div>
  );

  const renameFromMenu = () => {
    if (!menu) return;
    const current = displaySessionName(menu.session, sessionAliases);
    const next = window.prompt("Rename session", current)?.trim();
    if (next) onRenameSession?.(menu.session.id, next);
    setMenu(null);
  };

  return (
    <div className="sidebar">
      {onCollapse && <button className="sb-collapse" onClick={onCollapse} title="Collapse sidebar"><Icon name="chevLeft" size={11} /></button>}
      <div className="sb-scroll">
        <div className="sb-label">Sessions <span className="sb-count">{sessions.length || "..."}</span></div>
        <button className="sb-nav sb-action" onClick={onNewSession}><Icon name="plus" size={12} /><span>New session</span></button>
        {sessions.length === 0 && <div className="sb-empty">Fetching sessions...</div>}
        {pinnedSessions.length > 0 && (
          <>
            <div className="sb-label subtle">Pinned <span className="sb-count">{pinnedSessions.length}</span></div>
            {pinnedSessions.map(renderSession)}
            <div className="sb-label subtle">Recent</div>
          </>
        )}
        {recentSessions.map(renderSession)}
        {olderSessions.length > 0 && (
          <>
            <button className="sb-nav sb-action" onClick={() => setShowOlder((v) => !v)}>
              <Icon name={showOlder ? "chevDown" : "chevRight"} size={12} />
              <span>Show More Sessions</span>
              <span className="sb-item-meta">{olderSessions.length}</span>
            </button>
            {showOlder && olderSessions.map(renderSession)}
          </>
        )}
        {menu && (
          <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="ctx-head">{displaySessionName(menu.session, sessionAliases)}</div>
            <div className="ctx-item" onClick={() => { onSessionSelect?.(menu.session); setMenu(null); onViewChange("chat"); }}><Icon name="eye" size={11} /> Open session</div>
            <div className="ctx-item" onClick={() => { onPopoutSession?.(menu.session); setMenu(null); }}><Icon name="popout" size={11} /> Pop out session</div>
            <div className={"ctx-item" + (splitActive ? " disabled" : "")} onClick={() => { if (!splitActive) onSplitWith?.(menu.session); setMenu(null); }}><Icon name="split" size={11} /> Split session here<span className="ctx-kbd">Ctrl+Shift+S</span></div>
            <div className="ctx-sep"></div>
            <div className="ctx-item" onClick={() => { onTogglePinSession?.(menu.session.id); setMenu(null); }}><Icon name="pin" size={11} /> {pinnedSet.has(menu.session.id) ? "Unpin session" : "Pin session"}</div>
            <div className="ctx-item" onClick={renameFromMenu}><Icon name="file" size={11} /> Rename</div>
            <div className="ctx-item disabled" title="Unavailable until OpenClaw exposes sessions archive support"><Icon name="folder" size={11} /> Archive unavailable</div>
          </div>
        )}
        <div className="sb-sep"></div>
        {nav("skills", "tool", "Skills")}
        {nav("plugins", "plug", "Plugins")}
        {nav("logs", "list", "Logs")}
        {nav("doctor", "cpu", "Doctor")}
        {nav("gateway", "layers", "Gateway Overview")}
        <div className="heartbeat">
          <div className="hb-head">
            <div className="hb-title">Heartbeat</div>
            <div className={"hb-live" + (!gateway ? " loading" : "")}>{gateway?.status ?? "fetching"}</div>
          </div>
          <div className="hb-graph">
            {bars.map((h, i) => <div key={i} className={"hb-bar" + (i === bars.length - 1 ? " last" : "")} style={{ height: Math.max(6, Math.min(100, h)) + "%" }}></div>)}
          </div>
          <div className="hb-log">
            <div><span className="ok">●</span> latency <span className="ok">{gateway?.latency_ms ?? "--"}ms</span></div>
            <div><span className="ok">●</span> nodes <span className="ok">{gateway?.nodes.length ?? 0}</span></div>
            <div><span className="warn">●</span> poll 5s</div>
          </div>
        </div>
      </div>
      <div className="sb-footer">
        <div className="settings-btn" onClick={onOpenSettings}><Icon name="settings" size={12} /><span>Settings</span></div>
        <span>v0.1.0</span>
      </div>
    </div>
  );
}

function displaySessionName(session: SessionInfo, aliases: SessionAliases) {
  return aliases[session.id] || shortSessionName(session.name);
}

function shortSessionName(name: string) {
  const parts = name.split(":").filter(Boolean);
  return parts[parts.length - 1] || name;
}

function isRecentSession(session: SessionInfo) {
  const age = session.ageMs ?? parseAgeLabel(session.time);
  return age == null || age <= 48 * 60 * 60 * 1000;
}

function parseAgeLabel(label: string) {
  const text = label.trim().toLowerCase();
  if (!text || text === "mock" || text === "new") return null;
  if (text === "yest" || text === "yesterday") return 24 * 60 * 60 * 1000;
  const match = text.match(/^(\d+)\s*([smhd])$/);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2];
  if (unit === "s") return value * 1000;
  if (unit === "m") return value * 60 * 1000;
  if (unit === "h") return value * 60 * 60 * 1000;
  return value * 24 * 60 * 60 * 1000;
}
