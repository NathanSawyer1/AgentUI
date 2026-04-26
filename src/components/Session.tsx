import { useEffect, useRef, useState } from "react";
import type { GatewayStatus, Message, SessionInfo } from "../lib/types";
import { Chat } from "./Chat";
import { Composer } from "./Composer";
import { Icon } from "./Icons";
import { Sidebar, type NavView } from "./Sidebar";
import { DiffViewer } from "../panels/DiffViewer";
import { GatewayStatus as GatewayStatusPanel, StubPanel } from "../panels/GatewayStatus";
import { Terminal } from "../panels/Terminal";

function nowTime() {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

export function Session({ onOpenSettings, onSplitWith, onCloseSplit, canClose, hideSidebar, sessionName, splitActive, gateway }: {
  onOpenSettings: () => void;
  onSplitWith?: (session: SessionInfo) => void;
  onCloseSplit?: () => void;
  canClose?: boolean;
  hideSidebar?: boolean;
  sessionName?: string;
  splitActive?: boolean;
  gateway: GatewayStatus | null;
}) {
  const [view, setView] = useState<NavView>("chat");
  const [diffOpen, setDiffOpen] = useState(true);
  const [termOpen, setTermOpen] = useState(false);
  const [termPlacement, setTermPlacement] = useState<"right" | "bottom">("right");
  const [termHeight, setTermHeight] = useState(220);
  const [diffWidth, setDiffWidth] = useState(380);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [outbound, setOutbound] = useState<Message[]>([]);
  const [error, setError] = useState("");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const diffDragRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef({ dragging: false, startX: 0, startW: 0, liveW: diffWidth });
  const sessionId = sessionName || "refactor-auth-flow";

  useEffect(() => {
    const el = diffDragRef.current;
    if (!el) return;
    const down = (e: MouseEvent) => {
      dragState.current = { ...dragState.current, dragging: true, startX: e.clientX, startW: dragState.current.liveW };
      document.body.style.cursor = "col-resize";
      el.classList.add("dragging");
      e.preventDefault();
    };
    const move = (e: MouseEvent) => {
      const st = dragState.current;
      if (!st.dragging) return;
      const bodyW = bodyRef.current?.getBoundingClientRect().width || 1200;
      const dynMax = Math.max(400, bodyW - 280);
      setDiffWidth(Math.max(280, Math.min(dynMax, st.startW + st.startX - e.clientX)));
    };
    const up = () => {
      dragState.current.dragging = false;
      document.body.style.cursor = "";
      el.classList.remove("dragging");
    };
    el.addEventListener("mousedown", down);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      el.removeEventListener("mousedown", down);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  useEffect(() => {
    dragState.current.liveW = diffWidth;
  }, [diffWidth]);

  const mainContent = view === "chat"
    ? (
      <>
        {error && <div className="error-banner inline">{error}</div>}
        <Chat sessionId={sessionId} outbound={outbound} />
        <Composer sessionId={sessionId} onUserMessage={(text) => setOutbound((m) => [...m, { kind: "user", time: nowTime(), text }])} onError={setError} />
        {termOpen && termPlacement === "bottom" && <Terminal onClose={() => setTermOpen(false)} placement="bottom" onTogglePlacement={() => setTermPlacement("right")} height={termHeight} onHeightChange={setTermHeight} />}
      </>
    )
    : view === "gateway" ? <GatewayStatusPanel />
    : <StubPanel title={view[0].toUpperCase() + view.slice(1)} />;

  return (
    <div className="session">
      {!hideSidebar && !sidebarCollapsed && <Sidebar onOpenSettings={onOpenSettings} onSplitWith={onSplitWith} splitActive={splitActive} onCollapse={() => setSidebarCollapsed(true)} activeView={view} onViewChange={setView} gateway={gateway} />}
      <div className="main">
        <div className="topbar">
          {!hideSidebar && sidebarCollapsed && <button className="tb-btn icon-only" onClick={() => setSidebarCollapsed(false)} title="Show sidebar"><Icon name="chevRight" size={12} /></button>}
          <div className="tb-crumb"><span>{sessionName || "refactor-auth-flow"}</span><span className="sep">-</span><span className="agent">openclaw</span></div>
          <div className="tb-status working">agent - working</div>
          <div className="tb-spacer"></div>
          {canClose && <button className="tb-btn" onClick={onCloseSplit} title="Close split"><Icon name="x" size={12} /> close split</button>}
          <button className={"tb-btn" + (termOpen ? " active" : "")} onClick={() => setTermOpen(!termOpen)}><Icon name="terminal" size={12} />terminal<span className="kbd">Ctrl+Shift+T</span></button>
          <button className={"tb-btn" + (diffOpen ? " active" : "")} onClick={() => setDiffOpen(!diffOpen)}><Icon name="diff" size={12} />diff<span className="kbd">Ctrl+Shift+D</span></button>
        </div>
        <div className="body" ref={bodyRef}>
          <div className="chat-col" style={{ flex: "1 1 0", minWidth: 280, width: 0 }}>{mainContent}</div>
          {view === "chat" && (diffOpen || (termOpen && termPlacement === "right")) && (
            <>
              <div className="h-resizer" ref={diffDragRef}></div>
              <div className="side-col" style={{ flex: "0 0 " + diffWidth + "px", width: diffWidth + "px", minWidth: 0, maxWidth: "none" }}>
                {diffOpen && <DiffViewer onClose={() => setDiffOpen(false)} />}
                {termOpen && termPlacement === "right" && <Terminal onClose={() => setTermOpen(false)} placement="right" onTogglePlacement={() => setTermPlacement("bottom")} height={termHeight} onHeightChange={setTermHeight} />}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
