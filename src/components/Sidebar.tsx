import { useEffect, useState } from "react";
import { SESSIONS } from "../lib/fixtures";
import type { GatewayStatus, SessionInfo } from "../lib/types";
import { Icon } from "./Icons";

export type NavView = "chat" | "gateway" | "skills" | "plugins" | "logs";

export function Sidebar({ onOpenSettings, onSplitWith, splitActive, onCollapse, activeView, onViewChange, gateway }: {
  onOpenSettings: () => void;
  onSplitWith?: (session: SessionInfo) => void;
  splitActive?: boolean;
  onCollapse?: () => void;
  activeView: NavView;
  onViewChange: (view: NavView) => void;
  gateway: GatewayStatus | null;
}) {
  const [active, setActive] = useState("s1");
  const [menu, setMenu] = useState<{ x: number; y: number; session: SessionInfo } | null>(null);
  const bars = gateway?.history ?? Array.from({ length: 28 }).map((_, i) => 30 + (Math.sin(i * 1.7) * 0.5 + 0.5) * 70);

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

  return (
    <div className="sidebar">
      {onCollapse && <button className="sb-collapse" onClick={onCollapse} title="Collapse sidebar"><Icon name="chevLeft" size={11} /></button>}
      <div className="sb-label">Sessions <span className="sb-count">{SESSIONS.length}</span></div>
      {SESSIONS.map((s) => (
        <div key={s.id} className={"sb-item" + (active === s.id ? " active" : "")} onClick={() => { setActive(s.id); onViewChange("chat"); }} onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, session: s }); }}>
          <span className={"sb-dot " + s.status}></span>
          <span className="sb-item-text">{s.name}</span>
          <span className="sb-item-meta">{s.time}</span>
        </div>
      ))}
      {menu && (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
          <div className="ctx-head">{menu.session.name}</div>
          <div className="ctx-item" onClick={() => { setActive(menu.session.id); setMenu(null); onViewChange("chat"); }}><Icon name="eye" size={11} /> Open session</div>
          <div className={"ctx-item" + (splitActive ? " disabled" : "")} onClick={() => { if (!splitActive) onSplitWith?.(menu.session); setMenu(null); }}><Icon name="split" size={11} /> Split session here<span className="ctx-kbd">Ctrl+Shift+S</span></div>
          <div className="ctx-sep"></div>
          <div className="ctx-item"><Icon name="file" size={11} /> Rename</div>
          <div className="ctx-item danger"><Icon name="x" size={11} /> Archive</div>
        </div>
      )}
      <div className="sb-sep"></div>
      {nav("gateway", "layers", "Gateway Overview")}
      {nav("skills", "tool", "Skills")}
      {nav("plugins", "plug", "Plugins")}
      {nav("logs", "list", "Logs")}
      <div className="sb-spacer"></div>
      <div className="heartbeat">
        <div className="hb-head">
          <div className="hb-title">Heartbeat</div>
          <div className="hb-live">{gateway?.status ?? "mock"}</div>
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
      <div className="sb-footer">
        <div className="settings-btn" onClick={onOpenSettings}><Icon name="settings" size={12} /><span>Settings</span></div>
        <span>v0.1.0</span>
      </div>
    </div>
  );
}
