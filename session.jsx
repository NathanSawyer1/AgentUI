const { useState: useStateS, useRef: useRefS, useEffect: useEffectS } = React;

function Session({ onOpenSettings, onSplitWith, onCloseSplit, canClose, hideSidebar, sessionName, splitActive }) {
  const [diffOpen, setDiffOpen] = useStateS(true);
  const [termOpen, setTermOpen] = useStateS(false);
  const [termPlacement, setTermPlacement] = useStateS("right"); // 'right' | 'bottom'
  const [termHeight, setTermHeight] = useStateS(220);
  const [diffWidth, setDiffWidth] = useStateS(380);
  const [sidebarCollapsed, setSidebarCollapsed] = useStateS(false);
  const bodyRef = useRefS(null);

  // diff resize handle — use refs so state doesn't tear down listeners mid-drag
  const diffDragRef = useRefS(null);
  const dragState = useRefS({ dragging: false, startX: 0, startW: 0 });
  useEffectS(() => {
    const el = diffDragRef.current;
    if (!el) return;
    const down = (e) => {
      const liveW = dragState.current.liveW ?? diffWidth;
      dragState.current = { ...dragState.current, dragging: true, startX: e.clientX, startW: liveW };
      document.body.style.cursor = "col-resize";
      el.classList.add("dragging");
      e.preventDefault();
    };
    const move = (e) => {
      const st = dragState.current;
      if (!st.dragging) return;
      const dx = st.startX - e.clientX;
      const bodyW = bodyRef.current?.getBoundingClientRect().width || 1200;
      const dynMax = Math.max(400, bodyW - 280);
      setDiffWidth(Math.max(280, Math.min(dynMax, st.startW + dx)));
    };
    const up = () => {
      if (!dragState.current.dragging) return;
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
  // keep diffWidth fresh for "down" via a ref
  useEffectS(() => { dragState.current.liveW = diffWidth; }, [diffWidth]);

  return (
    <div className="session">
      {!hideSidebar && !sidebarCollapsed && (
        <Sidebar onOpenSettings={onOpenSettings}
                 onSplitWith={onSplitWith}
                 splitActive={splitActive}
                 onCollapse={() => setSidebarCollapsed(true)} />
      )}
      <div className="main">
        <div className="topbar">
          {!hideSidebar && sidebarCollapsed && (
            <button className="tb-btn icon-only" onClick={() => setSidebarCollapsed(false)} title="Show sidebar">
              <Icon name="chevRight" size={12} />
            </button>
          )}
          <div className="tb-crumb">
            <span>{sessionName || "refactor-auth-flow"}</span>
            <span className="sep">·</span>
            <span className="agent">openclaw</span>
          </div>
          <div className="tb-status working">agent · working</div>
          <div className="tb-spacer"></div>

          {canClose && (
            <button className="tb-btn" onClick={onCloseSplit} title="Close split">
              <Icon name="x" size={12} /> close split
            </button>
          )}

          <button className={"tb-btn" + (termOpen ? " active" : "")}
                  onClick={() => setTermOpen(!termOpen)}>
            <Icon name="terminal" size={12} />
            terminal
            <span className="kbd">⌘⇧T</span>
          </button>
          <button className={"tb-btn" + (diffOpen ? " active" : "")}
                  onClick={() => setDiffOpen(!diffOpen)}>
            <Icon name="diff" size={12} />
            diff
            <span className="kbd">⌘⇧D</span>
          </button>
        </div>

        <div className="body" ref={bodyRef}>
          <div className="chat-col" style={{ flex: "1 1 0", minWidth: 280, width: 0 }}>
            <Chat />
            <Composer />
            {termOpen && termPlacement === "bottom" && (
              <Terminal
                onClose={() => setTermOpen(false)}
                placement="bottom"
                onTogglePlacement={() => setTermPlacement("right")}
                height={termHeight}
                onHeightChange={setTermHeight}
              />
            )}
          </div>
          {(diffOpen || (termOpen && termPlacement === "right")) && (
            <>
              <div className="h-resizer" ref={diffDragRef}></div>
              <div className="side-col" style={{ flex: "0 0 " + diffWidth + "px", width: diffWidth + "px", minWidth: 0, maxWidth: "none" }}>
                {diffOpen && <DiffViewer onClose={() => setDiffOpen(false)} />}
                {termOpen && termPlacement === "right" && (
                  <Terminal
                    onClose={() => setTermOpen(false)}
                    placement="right"
                    onTogglePlacement={() => setTermPlacement("bottom")}
                    height={termHeight}
                    onHeightChange={setTermHeight}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

window.Session = Session;
