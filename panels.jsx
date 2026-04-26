const { useState: useStateP, useRef: useRefP, useEffect: useEffectP } = React;

/* DIFF VIEWER ================================================= */

function DiffViewer({ onClose }) {
  const { DIFF_FILES, DIFF_ROWS } = window.DEMO;
  const [activeFile, setActiveFile] = useStateP(DIFF_FILES[0].path);

  return (
    <div className="diff">
      <div className="panel-head">
        <div className="panel-title"><Icon name="diff" size={12} /> Diff Viewer</div>
        <div className="panel-spacer"></div>
        <button className="panel-btn" title="Copy patch"><Icon name="code" size={12} /></button>
        <button className="panel-btn" onClick={onClose} title="Close"><Icon name="x" size={12} /></button>
      </div>

      <div className="diff-tabs">
        {DIFF_FILES.map(f => {
          const name = f.path.split("/").pop();
          return (
            <div key={f.path}
                 className={"diff-tab" + (activeFile === f.path ? " active" : "")}
                 onClick={() => setActiveFile(f.path)}>
              <Icon name="file" size={10} />
              <span>{name}</span>
              <span className="badge">+{f.adds} −{f.dels}</span>
            </div>
          );
        })}
      </div>

      <div className="diff-file" title={activeFile}>
        <Icon name="folder" size={10} />
        <span className="path">{activeFile}</span>
        <span className="adds">+{DIFF_FILES.find(f => f.path === activeFile).adds}</span>
        <span className="dels">−{DIFF_FILES.find(f => f.path === activeFile).dels}</span>
      </div>

      <div className="diff-view">
        <div className="diff-side">
          <div className="diff-side-head"><span className="dot-old"></span> before · main</div>
          {DIFF_ROWS.map((row, i) => {
            if (row.type === "hunk") {
              return <div key={i} className="diff-row hunk"><div className="code">{row.label}</div></div>;
            }
            const cls = row.old.kind === "del" ? "del" : row.old.kind === "add" ? "add" : "";
            return (
              <div key={i} className={"diff-row " + cls}>
                <div className="ln">{row.old.ln}</div>
                <div className="code">{row.old.code}</div>
              </div>
            );
          })}
        </div>
        <div className="diff-side">
          <div className="diff-side-head"><span className="dot-new"></span> after · working</div>
          {DIFF_ROWS.map((row, i) => {
            if (row.type === "hunk") {
              return <div key={i} className="diff-row hunk"><div className="code">{row.label}</div></div>;
            }
            const cls = row.nw.kind === "add" ? "add" : row.nw.kind === "del" ? "del" : "";
            return (
              <div key={i} className={"diff-row " + cls}>
                <div className="ln">{row.nw.ln}</div>
                <div className="code">{row.nw.code}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* TERMINAL ==================================================== */

function Terminal({ onClose, placement, onTogglePlacement, height, onHeightChange }) {
  const { TERM_LINES } = window.DEMO;
  const [input, setInput] = useStateP("");
  const [lines, setLines] = useStateP(TERM_LINES);
  const bodyRef = useRefP(null);

  useEffectP(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [lines]);

  const runCmd = () => {
    if (!input.trim()) return;
    const newLines = [
      ...lines.slice(0, -1),
      { kind: "prompt", cwd: "~/openclaw-api (wt/refactor-auth-flow)", cmd: input },
      { kind: "out", text: "(demo) ok" },
      { kind: "prompt", cwd: "~/openclaw-api (wt/refactor-auth-flow)", cmd: "" },
    ];
    setLines(newLines);
    setInput("");
  };

  // vertical resize handle — use refs so state doesn't tear down listeners mid-drag
  const dragRef = useRefP(null);
  const dragState = useRefP({ dragging: false, startY: 0, startH: 0, liveH: height });
  useEffectP(() => { dragState.current.liveH = height; }, [height]);
  useEffectP(() => {
    const el = dragRef.current;
    if (!el) return;
    const maxH = () => {
      // allow terminal to grow up to (body height - 120) so chat keeps breathing room
      const chatCol = el.closest(".chat-col") || el.parentElement;
      const parent = chatCol?.parentElement; // .body
      const bodyH = parent?.getBoundingClientRect().height || 800;
      return Math.max(160, bodyH - 120);
    };
    const down = (e) => {
      dragState.current = { ...dragState.current, dragging: true, startY: e.clientY, startH: dragState.current.liveH };
      document.body.style.cursor = "row-resize";
      el.classList.add("dragging");
      e.preventDefault();
    };
    const move = (e) => {
      const st = dragState.current;
      if (!st.dragging) return;
      const dh = st.startY - e.clientY;
      onHeightChange(Math.max(100, Math.min(maxH(), st.startH + dh)));
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

  return (
    <div className={"terminal-wrap " + (placement === "bottom" ? "bottom" : "")}
         style={{ height: height + "px" }}>
      <div className="term-resize-top" ref={dragRef}></div>
      <div className="term-head">
        <div className="term-tabs">
          <div className="term-tab active">
            <Icon name="terminal" size={10} />
            <span>zsh · worktree</span>
          </div>
          <div className="term-tab">
            <Icon name="play" size={10} />
            <span>vitest · watch</span>
          </div>
        </div>
        <div className="panel-spacer"></div>
        <button className="panel-btn" onClick={onTogglePlacement}
                title={placement === "bottom" ? "Dock right" : "Dock bottom"}>
          <Icon name="split" size={12} />
        </button>
        <button className="panel-btn" onClick={onClose} title="Close">
          <Icon name="x" size={12} />
        </button>
      </div>
      <div className="term-body" ref={bodyRef} onClick={() => {
        const t = bodyRef.current?.querySelector("input"); if (t) t.focus();
      }}>
        {lines.map((l, i) => {
          if (l.kind === "prompt") {
            const isLast = i === lines.length - 1 && !l.cmd;
            return (
              <div key={i} className="term-line">
                <span className="cwd">{l.cwd}</span>
                <span className="prompt">❯</span>
                {isLast ? (
                  <>
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") runCmd(); }}
                      style={{ flex: 1, color: "var(--fg-0)" }}
                      autoFocus
                    />
                  </>
                ) : (
                  <span>{l.cmd}</span>
                )}
              </div>
            );
          }
          const cls = l.kind === "muted" ? "muted" : l.kind === "warn" ? "warn" : l.kind === "err" ? "err" : l.kind === "ok" ? "" : "";
          return (
            <div key={i} className="term-line">
              <span className={l.kind === "ok" ? "" : cls}>{l.text || "\u00A0"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.DiffViewer = DiffViewer;
window.Terminal = Terminal;
