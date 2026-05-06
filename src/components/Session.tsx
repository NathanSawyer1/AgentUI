import { useEffect, useRef, useState } from "react";
import type { AppSettings, GatewayStatus, SessionInfo } from "../lib/types";
import { Chat } from "./Chat";
import { Icon } from "./Icons";
import { Sidebar, type NavView } from "./Sidebar";
import { GatewayStatus as GatewayStatusPanel } from "../panels/GatewayStatus";
import { Skills } from "../panels/Skills";
import { Plugins } from "../panels/Plugins";
import { Logs } from "../panels/Logs";
import { Doctor } from "../panels/Doctor";
import { DiffViewer } from "../panels/DiffViewer";
import { Terminal } from "../panels/Terminal";

export function Session({ onOpenSettings, onSplitWith, onPopoutSession, onCloseSplit, canClose, hideSidebar, sessionId, sessions, sessionAliases, pinnedSessionIds, onNewSession, onRenameSession, onTogglePinSession, onSessionSelect, splitActive, gateway, settings }: {
  onOpenSettings: () => void;
  onSplitWith?: (session: SessionInfo) => void;
  onPopoutSession?: (session: SessionInfo) => void;
  onCloseSplit?: () => void;
  canClose?: boolean;
  hideSidebar?: boolean;
  sessionId: string;
  sessions: SessionInfo[];
  sessionAliases: Record<string, string>;
  pinnedSessionIds: string[];
  onNewSession?: () => void;
  onRenameSession?: (sessionId: string, name: string) => void;
  onTogglePinSession?: (sessionId: string) => void;
  onSessionSelect?: (session: SessionInfo) => void;
  splitActive?: boolean;
  gateway: GatewayStatus | null;
  settings: AppSettings;
}) {
  const [view, setView] = useState<NavView>("chat");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [error, setError] = useState("");
  const [diffOpen, setDiffOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [sideWidth, setSideWidth] = useState(38);
  const [terminalPlacement, setTerminalPlacement] = useState<"right" | "bottom">("bottom");
  const [terminalHeight, setTerminalHeight] = useState(230);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const sideDrag = useRef(false);
  const currentSession = sessions.find((session) => session.id === sessionId || session.name === sessionId) || { id: sessionId, name: sessionAliases[sessionId] || sessionId, status: "idle" as const, time: "" };

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!sideDrag.current || !bodyRef.current) return;
      const rect = bodyRef.current.getBoundingClientRect();
      const width = ((rect.right - event.clientX) / rect.width) * 100;
      setSideWidth(Math.max(24, Math.min(62, width)));
    };
    const onUp = () => {
      sideDrag.current = false;
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  useEffect(() => {
    const onNavigate = (event: Event) => {
      const view = (event as CustomEvent<NavView>).detail;
      if (view) setView(view);
    };
    const onToggleDiff = () => setDiffOpen((open) => !open);
    const onToggleTerminal = () => setTerminalOpen((open) => !open);
    window.addEventListener("agentui:navigate", onNavigate);
    window.addEventListener("agentui:toggle-diff", onToggleDiff);
    window.addEventListener("agentui:toggle-terminal", onToggleTerminal);
    return () => {
      window.removeEventListener("agentui:navigate", onNavigate);
      window.removeEventListener("agentui:toggle-diff", onToggleDiff);
      window.removeEventListener("agentui:toggle-terminal", onToggleTerminal);
    };
  }, []);

  const mainContent = (() => {
    if (view === "chat") return (
      <>
        {error && <div className="error-banner inline">{error}</div>}
        <Chat sessionId={sessionId} useMock={settings.useMock} onError={setError} />
      </>
    );
    if (view === "skills") return <Skills />;
    if (view === "plugins") return <Plugins />;
    if (view === "logs") return <Logs />;
    if (view === "doctor") return <Doctor />;
    return <GatewayStatusPanel />;
  })();

  return (
    <div className="session">
      {!hideSidebar && !sidebarCollapsed && <Sidebar onOpenSettings={onOpenSettings} onSplitWith={onSplitWith} onPopoutSession={onPopoutSession} splitActive={splitActive} onCollapse={() => setSidebarCollapsed(true)} activeView={view} onViewChange={setView} gateway={gateway} activeSessionId={sessionId} sessions={sessions} sessionAliases={sessionAliases} pinnedSessionIds={pinnedSessionIds} onNewSession={onNewSession} onRenameSession={onRenameSession} onTogglePinSession={onTogglePinSession} onSessionSelect={onSessionSelect} />}
      <div className="main">
        <div className="topbar">
          {!hideSidebar && sidebarCollapsed && <button className="tb-btn icon-only" onClick={() => setSidebarCollapsed(false)} title="Show sidebar"><Icon name="chevRight" size={12} /></button>}
          <div className="tb-crumb"><span>{sessionId}</span><span className="sep">-</span><span className="agent">openclaw</span></div>
          <div className="tb-spacer"></div>
          <button className={"tb-btn" + (diffOpen ? " active" : "")} onClick={() => setDiffOpen((open) => !open)} title="Toggle diff viewer"><Icon name="diff" size={12} /> Diff</button>
          <button className={"tb-btn" + (terminalOpen ? " active" : "")} onClick={() => setTerminalOpen((open) => !open)} title="Toggle terminal"><Icon name="terminal" size={12} /> Terminal</button>
          {canClose && onPopoutSession && <button className="tb-btn" onClick={() => onPopoutSession(currentSession)} title="Pop out split"><Icon name="popout" size={12} /> Pop out</button>}
          {canClose && <button className="tb-btn" onClick={onCloseSplit} title="Close split"><Icon name="x" size={12} /> close split</button>}
        </div>
        <div className="body" ref={bodyRef}>
          <div className="chat-col" style={diffOpen || (terminalOpen && terminalPlacement === "right") ? { width: `${100 - sideWidth}%` } : undefined}>
            {mainContent}
            {terminalOpen && terminalPlacement === "bottom" && <Terminal onClose={() => setTerminalOpen(false)} placement={terminalPlacement} onTogglePlacement={() => setTerminalPlacement("right")} height={terminalHeight} onHeightChange={setTerminalHeight} />}
          </div>
          {(diffOpen || (terminalOpen && terminalPlacement === "right")) && (
            <>
              <div className="side-resizer" onMouseDown={() => { sideDrag.current = true; document.body.style.cursor = "col-resize"; }} />
              <div className="side-panel" style={{ width: `${sideWidth}%` }}>
                {diffOpen ? <DiffViewer onClose={() => setDiffOpen(false)} /> : terminalOpen ? <Terminal onClose={() => setTerminalOpen(false)} placement={terminalPlacement} onTogglePlacement={() => setTerminalPlacement("bottom")} height={terminalHeight} onHeightChange={setTerminalHeight} /> : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
