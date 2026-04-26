const { useState: useStateComp, useRef: useRefComp, useEffect: useEffectComp } = React;

function Dropdown({ open, onClose, children, align = "left" }) {
  const ref = useRefComp(null);
  useEffectComp(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return <div className={"dd-menu " + align} ref={ref}>{children}</div>;
}

function OptionMenu({ title, items, value, onChange, onClose }) {
  return (
    <>
      <div className="dd-head">{title}</div>
      {items.map(it => (
        <div key={it.id}
             className={"dd-item" + (value === it.id ? " active" : "")}
             onClick={() => { onChange(it.id); onClose(); }}>
          <span className="check">{value === it.id ? <Icon name="check" size={10} /> : null}</span>
          <div className="text">
            <div>{it.name}</div>
            {it.desc && <div className="desc">{it.desc}</div>}
          </div>
          <span className="meta">{it.meta}</span>
        </div>
      ))}
    </>
  );
}

function Composer() {
  const { MODELS, PERMS } = window.DEMO;
  const [text, setText] = useStateComp("");
  const [model, setModel] = useStateComp("sonnet");
  const [perm, setPerm] = useStateComp("edit");
  const [openDd, setOpenDd] = useStateComp(null); // 'model' | 'perm' | null
  const [attached, setAttached] = useStateComp([]);
  const textRef = useRefComp(null);
  const fileRef = useRefComp(null);

  const modelItem = MODELS.find(m => m.id === model);
  const permItem = PERMS.find(p => p.id === perm);

  const handleSend = () => {
    if (!text.trim()) return;
    setText("");
    setAttached([]);
    if (textRef.current) textRef.current.style.height = "auto";
  };

  const resize = (el) => {
    el.style.height = "auto";
    el.style.height = Math.min(160, el.scrollHeight) + "px";
  };

  const onFilePick = (e) => {
    const files = [...e.target.files].map(f => ({ name: f.name, size: f.size }));
    setAttached(a => [...a, ...files]);
    e.target.value = "";
  };

  return (
    <div className="composer-wrap">
      <div className="composer-inner">
        <div className="suggestions">
          <div className="suggestion">Run the test suite</div>
          <div className="suggestion">Open a PR with these changes</div>
          <div className="suggestion">Explain the token bucket</div>
        </div>

        <div className="composer">
          {attached.length > 0 && (
            <div className="attachments">
              {attached.map((f, i) => (
                <div key={i} className="att">
                  <Icon name="file" size={10} />
                  {f.name}
                  <span className="x" onClick={() => setAttached(a => a.filter((_, j) => j !== i))}>
                    <Icon name="x" size={10} />
                  </span>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={textRef}
            className="composer-text"
            placeholder="Your message here…"
            value={text}
            rows={1}
            onChange={(e) => { setText(e.target.value); resize(e.target); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
          />
          <div className="composer-bar">
            <input ref={fileRef} type="file" multiple hidden onChange={onFilePick} />
            <button className="cb-btn plus" title="Attach files or screenshots"
                    onClick={() => fileRef.current?.click()}>
              <Icon name="plus" size={14} />
            </button>

            <div className="dd-wrap">
              <button className="cb-btn" onClick={() => setOpenDd(openDd === "perm" ? null : "perm")}>
                <Icon name="check" size={11} />
                {permItem.name}
                <Icon name="chevDown" size={10} />
              </button>
              <Dropdown open={openDd === "perm"} onClose={() => setOpenDd(null)} align="left">
                <OptionMenu title="Permissions" items={PERMS} value={perm}
                            onChange={setPerm} onClose={() => setOpenDd(null)} />
              </Dropdown>
            </div>

            <div className="cb-spacer"></div>

            <div className="dd-wrap">
              <button className="cb-btn" onClick={() => setOpenDd(openDd === "model" ? null : "model")}>
                <Icon name="cpu" size={11} />
                {modelItem.name}
                <Icon name="chevDown" size={10} />
              </button>
              <Dropdown open={openDd === "model"} onClose={() => setOpenDd(null)} align="right">
                <OptionMenu title="Model" items={MODELS} value={model}
                            onChange={setModel} onClose={() => setOpenDd(null)} />
              </Dropdown>
            </div>

            <button className="cb-send" disabled={!text.trim()} onClick={handleSend}>
              <Icon name="arrowUp" size={14} stroke={2} />
            </button>
          </div>
        </div>

        <div className="meta-row">
          <div className="left">
            <span className="kv"><Icon name="folder" size={10} /> <span className="v">openclaw-api</span></span>
            <span className="kv"><Icon name="gitBranch" size={10} /> <span className="v">wt/refactor-auth-flow</span></span>
          </div>
          <div className="usage">
            <span className="kv"><span className="k">usage</span> <span className="v">77% left · 5h</span></span>
            <span className="kv">
              <span className="k">context</span>
              <div className="bar"><div className="fill" style={{ width: "50%" }}></div></div>
              <span className="v">100k / 200k</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

window.Composer = Composer;
window.Dropdown = Dropdown;
window.OptionMenu = OptionMenu;
