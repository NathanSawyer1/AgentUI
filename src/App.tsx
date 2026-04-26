import { useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, SESSIONS } from "./lib/fixtures";
import { gatewayStatus, settingsGet, settingsSet } from "./lib/openclaw";
import type { AppSettings, GatewayStatus, SessionInfo } from "./lib/types";
import { SettingsModal, applySettings } from "./components/Settings";
import { Session } from "./components/Session";

export function App() {
  const [split, setSplit] = useState(false);
  const [splitSession, setSplitSession] = useState<SessionInfo | null>(null);
  const [leftW, setLeftW] = useState(60);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [gateway, setGateway] = useState<GatewayStatus | null>(null);
  const dragging = useRef(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const resizerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void settingsGet().then((next) => {
      setSettings(next);
      applySettings(next);
    });
  }, []);

  useEffect(() => {
    applySettings(settings);
    void settingsSet(settings).catch(() => undefined);
  }, [settings]);

  useEffect(() => {
    const load = () => void gatewayStatus().then(setGateway).catch(() => undefined);
    load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, []);

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
          setSplitSession(SESSIONS.find((x) => !x.active) || SESSIONS[1]);
          setSplit(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [split]);

  const openSplitWith = (session: SessionInfo) => {
    setSplitSession(session);
    setSplit(true);
  };

  return (
    <div className="app">
      <div className="titlebar">
        <div className="tb-dots"><span className="tb-dot r"></span><span className="tb-dot y"></span><span className="tb-dot g"></span></div>
        <div className="tb-title">AgentUI - openclaw - refactor-auth-flow{split && splitSession ? " <-> " + splitSession.name : ""}</div>
        <div className="tb-right"><span>Ctrl+K</span></div>
      </div>
      <div className="workspace" ref={wrapRef}>
        <div style={split ? { width: leftW + "%", display: "flex", minWidth: 0 } : { flex: 1, display: "flex", minWidth: 0 }}>
          <Session onOpenSettings={() => setSettingsOpen(true)} onSplitWith={openSplitWith} splitActive={split} sessionName="refactor-auth-flow" gateway={gateway} />
        </div>
        {split && (
          <>
            <div className="resizer" ref={resizerRef} onMouseDown={() => { dragging.current = true; document.body.style.cursor = "col-resize"; resizerRef.current?.classList.add("dragging"); }}></div>
            <div style={{ width: 100 - leftW + "%", display: "flex", minWidth: 0 }}>
              <Session onOpenSettings={() => setSettingsOpen(true)} onCloseSplit={() => setSplit(false)} canClose hideSidebar sessionName={splitSession?.name || "new-session"} gateway={gateway} />
            </div>
          </>
        )}
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} settings={settings} onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))} />}
    </div>
  );
}
