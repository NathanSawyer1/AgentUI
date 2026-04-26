const { useState: useStateA, useEffect: useEffectA, useRef: useRefA } = React;

function App() {
  const [split, setSplit] = useStateA(false);
  const [splitSession, setSplitSession] = useStateA(null);
  const [leftW, setLeftW] = useStateA(60); // percent
  const [settingsOpen, setSettingsOpen] = useStateA(false);
  const [settings, setSettings] = useStateA({
    theme: "dark",
    accent: "blue",
    font: "jetbrains",
    fontSize: 12,
  });

  useEffectA(() => { window.applySettings(settings); }, [settings]);

  const updateSettings = (patch) => setSettings(s => ({ ...s, ...patch }));

  // drag resizer
  const dragging = useRefA(false);
  const wrapRef = useRefA(null);
  const resizerRef = useRefA(null);

  useEffectA(() => {
    const onMove = (e) => {
      if (!dragging.current || !wrapRef.current) return;
      const rect = wrapRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftW(Math.max(25, Math.min(75, pct)));
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      if (resizerRef.current) resizerRef.current.classList.remove("dragging");
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startDrag = () => {
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    if (resizerRef.current) resizerRef.current.classList.add("dragging");
  };

  const openSplitWith = (sess) => {
    setSplitSession(sess);
    setSplit(true);
  };

  // keyboard shortcuts
  useEffectA(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (split) { setSplit(false); return; }
        const fallback = (window.DEMO.SESSIONS.find(x => !x.active) || window.DEMO.SESSIONS[1]);
        openSplitWith(fallback);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [split]);

  return (
    <div className="app">
      <div className="titlebar">
        <div className="tb-dots">
          <span className="tb-dot r"></span>
          <span className="tb-dot y"></span>
          <span className="tb-dot g"></span>
        </div>
        <div className="tb-title">AgentUI — openclaw · refactor-auth-flow{split && splitSession ? "  ⇄  " + splitSession.name : ""}</div>
        <div className="tb-right">
          <span>⌘K</span>
        </div>
      </div>

      <div className="workspace" ref={wrapRef}>
        <div style={split ? { width: leftW + "%", display: "flex", minWidth: 0 } : { flex: 1, display: "flex", minWidth: 0 }}>
          <Session
            onOpenSettings={() => setSettingsOpen(true)}
            onSplitWith={openSplitWith}
            splitActive={split}
            canClose={false}
            sessionName="refactor-auth-flow"
          />
        </div>
        {split && (
          <>
            <div className="resizer" ref={resizerRef} onMouseDown={startDrag}></div>
            <div style={{ width: (100 - leftW) + "%", display: "flex", minWidth: 0 }}>
              <Session
                onOpenSettings={() => setSettingsOpen(true)}
                onCloseSplit={() => setSplit(false)}
                canClose={true}
                hideSidebar={true}
                sessionName={splitSession ? splitSession.name : "new-session"}
              />
            </div>
          </>
        )}
      </div>

      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)}
                       settings={settings}
                       onChange={updateSettings} />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
