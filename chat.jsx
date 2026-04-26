const { useState: useStateChat, useRef: useRefChat, useEffect: useEffectChat } = React;

function ToolCard({ block, startOpen = false }) {
  const [open, setOpen] = useStateChat(startOpen);
  const statusClass = block.status === "ok" ? "ok" : block.status === "err" ? "err" : "";
  const statusIcon = block.status === "ok" ? "check" : block.status === "err" ? "x" : "spinner";
  return (
    <div className={"tool" + (open ? " open" : "")}>
      <div className="tool-head" onClick={() => setOpen(!open)}>
        <span className="tool-icon"><Icon name={toolIconFor(block.name)} size={11} /></span>
        <span className="tool-name">{block.name}</span>
        <span className="tool-arg">· {block.arg}</span>
        <span className={"tool-status " + statusClass}>
          <Icon name={statusIcon} size={11} />
          {block.status === "ok" ? "done" : block.status === "err" ? "failed" : "running"}
        </span>
        <span className="tool-chev"><Icon name="chevRight" size={11} /></span>
      </div>
      {open && (
        <div className="tool-body">
          {block.preview.map((line, i) => (
            <div key={i} className={line.c || ""}>{line.t}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function toolIconFor(name) {
  if (name === "bash" || name === "shell") return "terminal";
  if (name === "read_file") return "eye";
  if (name === "write_file") return "file";
  if (name === "edit_file") return "code";
  if (name === "grep") return "search";
  return "tool";
}

function Thinking() {
  return (
    <div className="thinking">
      thinking
      <span className="thinking-dots"><span></span><span></span><span></span></span>
    </div>
  );
}

function Message({ msg }) {
  if (msg.kind === "user") {
    return (
      <div className="msg user">
        <div>
          <div className="msg-meta" style={{ justifyContent: "flex-end" }}>
            <span className="time">{msg.time}</span>
            <span className="name">You</span>
          </div>
          <div className="bubble">{msg.text}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="msg agent">
      <div className="agent-name">openclaw · sonnet 4.5</div>
      <div className="content">
        {msg.blocks.map((b, i) => {
          if (b.type === "text") return <p key={i}>{renderInline(b.content)}</p>;
          if (b.type === "tool") return <ToolCard key={i} block={b} startOpen={b.status === "ok" && i === 1} />;
          if (b.type === "thinking") return <Thinking key={i} />;
          return null;
        })}
      </div>
    </div>
  );
}

function renderInline(text) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("`") && p.endsWith("`")) return <code key={i}>{p.slice(1, -1)}</code>;
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

function Chat() {
  const { MESSAGES } = window.DEMO;
  const scrollRef = useRefChat(null);
  useEffectChat(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  return (
    <div className="chat-scroll" ref={scrollRef}>
      <div className="chat-inner">
        {MESSAGES.map((m, i) => <Message key={i} msg={m} />)}
      </div>
    </div>
  );
}

window.Chat = Chat;
