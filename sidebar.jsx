const { useState, useRef, useEffect } = React;

function Sidebar({ onOpenSettings, onSplitWith, splitActive, onCollapse }) {
  const { SESSIONS } = window.DEMO;
  const [active, setActive] = useState("s1");
  const [menu, setMenu] = useState(null); // {x,y,session}

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("scroll", close, true);
    window.addEventListener("keydown", (e) => e.key === "Escape" && close());
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  // fake heartbeat bars
  const bars = Array.from({ length: 28 }).map((_, i) => {
    const seed = Math.sin(i * 1.7) * 0.5 + 0.5;
    return 30 + seed * 70;
  });

  return (
    <div className="sidebar">
      {onCollapse && (
        <button className="sb-collapse" onClick={onCollapse} title="Collapse sidebar">
          <Icon name="chevLeft" size={11} />
        </button>
      )}
      <div className="sb-label">
        Sessions <span className="sb-count">{SESSIONS.length}</span>
      </div>
      {SESSIONS.map(s => (
        <div key={s.id}
             className={"sb-item" + (active === s.id ? " active" : "")}
             onClick={() => setActive(s.id)}
             onContextMenu={(e) => {
               e.preventDefault();
               setMenu({ x: e.clientX, y: e.clientY, session: s });
             }}>
          <span className={"sb-dot " + s.status}></span>
          <span className="sb-item-text">{s.name}</span>
          <span className="sb-item-meta">{s.time}</span>
        </div>
      ))}

      {menu && (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }}
             onMouseDown={(e) => e.stopPropagation()}>
          <div className="ctx-head">{menu.session.name}</div>
          <div className="ctx-item" onClick={() => { setActive(menu.session.id); setMenu(null); }}>
            <Icon name="eye" size={11} /> Open session
          </div>
          <div className={"ctx-item" + (splitActive ? " disabled" : "")}
               onClick={() => {
                 if (splitActive) return;
                 onSplitWith && onSplitWith(menu.session);
                 setMenu(null);
               }}>
            <Icon name="split" size={11} /> Split session here
            <span className="ctx-kbd">⌘⇧S</span>
          </div>
          <div className="ctx-sep"></div>
          <div className="ctx-item"><Icon name="file" size={11} /> Rename</div>
          <div className="ctx-item danger"><Icon name="x" size={11} /> Archive</div>
        </div>
      )}

      <div className="sb-sep"></div>

      <div className="sb-nav"><Icon name="layers" /><span>Gateway Overview</span></div>
      <div className="sb-nav"><Icon name="tool" /><span>Skills</span></div>
      <div className="sb-nav"><Icon name="plug" /><span>Plugins</span></div>
      <div className="sb-nav"><Icon name="list" /><span>Logs</span></div>

      <div className="sb-spacer"></div>

      <div className="heartbeat">
        <div className="hb-head">
          <div className="hb-title">Heartbeat</div>
          <div className="hb-live">live</div>
        </div>
        <div className="hb-graph">
          {bars.map((h, i) => (
            <div key={i}
                 className={"hb-bar" + (i === bars.length - 1 ? " last" : "")}
                 style={{ height: h + "%" }}></div>
          ))}
        </div>
        <div className="hb-log">
          <div><span className="ok">●</span> 11:45  agent_ok <span className="ok">200</span></div>
          <div><span className="ok">●</span> 11:15  agent_ok <span className="ok">200</span></div>
          <div><span className="warn">●</span> 10:45  retry 1/3</div>
        </div>
      </div>

      <div className="sb-footer">
        <div className="settings-btn" onClick={onOpenSettings}>
          <Icon name="settings" size={12} />
          <span>Settings</span>
        </div>
        <span>v2026.8.11</span>
      </div>
    </div>
  );
}

window.Sidebar = Sidebar;
