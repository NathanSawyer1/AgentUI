import { useEffect, useRef, useState } from "react";
import { MESSAGES } from "../lib/fixtures";
import { listenChat, sessionHistory } from "../lib/openclaw";
import type { ChatEvent, HistoryMessage, Message as ChatMessage, ToolBlock } from "../lib/types";
import { Composer } from "./Composer";
import { Icon } from "./Icons";

function ToolCard({ block, startOpen = false }: { block: ToolBlock; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const statusClass = block.status === "ok" ? "ok" : block.status === "err" ? "err" : "";
  const statusIcon = block.status === "ok" ? "check" : block.status === "err" ? "x" : "spinner";
  return (
    <div className={"tool" + (open ? " open" : "")}>
      <div className="tool-head" onClick={() => setOpen(!open)}>
        <span className="tool-icon"><Icon name={toolIconFor(block.name)} size={11} /></span>
        <span className="tool-name">{block.name}</span>
        <span className="tool-arg">- {block.arg}</span>
        <span className={"tool-status " + statusClass}>
          <Icon name={statusIcon} size={11} />
          {block.status === "ok" ? "done" : block.status === "err" ? "failed" : "running"}
        </span>
        <span className="tool-chev"><Icon name="chevRight" size={11} /></span>
      </div>
      {open && (
        <div className="tool-body">
          {block.preview.map((line, i) => <div key={i} className={line.c || ""}>{line.t}</div>)}
        </div>
      )}
    </div>
  );
}

function toolIconFor(name: string) {
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

function renderInline(text: string) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("`") && p.endsWith("`")) return <code key={i}>{p.slice(1, -1)}</code>;
    return <span key={i}>{p}</span>;
  });
}

function Message({ msg }: { msg: ChatMessage }) {
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
      <div className="agent-name">openclaw</div>
      <div className="content">
        {msg.blocks.map((b, i) => {
          if (b.type === "text") return <p key={i}>{renderInline(b.content)}</p>;
          if (b.type === "tool") return <ToolCard key={i} block={b} startOpen={b.status === "ok" && i === 1} />;
          return <Thinking key={i} />;
        })}
      </div>
    </div>
  );
}

function nowTime() {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function historyTime(timestamp?: number) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

function mapHistoryMessage(message: HistoryMessage, index: number): ChatMessage {
  const time = historyTime(message.timestamp) || "history";
  if (message.role === "user") return { id: message.id ?? `history-user-${index}`, kind: "user", time, text: message.text };
  return { id: message.id ?? `history-agent-${index}`, kind: "agent", time, blocks: [{ type: "text", content: message.text }] };
}

export function Chat({ sessionId, useMock, onError }: { sessionId: string; useMock: boolean; onError: (message: string) => void }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    let cancelled = false;
    setMessages(useMock ? MESSAGES : []);
    if (useMock) return () => { cancelled = true; };
    void sessionHistory(sessionId, 1000)
      .then((history) => {
        if (!cancelled) setMessages(history.map(mapHistoryMessage));
      })
      .catch((error) => {
        if (!cancelled) onError(error instanceof Error ? error.message : String(error));
      });
    return () => { cancelled = true; };
  }, [sessionId, useMock, onError]);

  useEffect(() => {
    const applyEvent = (event: ChatEvent) => {
      if (event.session_id !== sessionId) return;
      setMessages((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        const ensureAgent = () => {
          if (last?.kind === "agent") return last;
          const agent: ChatMessage = { kind: "agent", time: nowTime(), blocks: [] };
          next.push(agent);
          return agent;
        };
        if (event.type === "start") {
          next.push({ kind: "agent", time: nowTime(), blocks: [{ type: "thinking" }] });
        } else if (event.type === "token") {
          const agent = ensureAgent();
          agent.blocks = agent.blocks.filter((block) => block.type !== "thinking");
          const tail = agent.blocks[agent.blocks.length - 1];
          if (tail?.type === "text") tail.content += event.content;
          else agent.blocks.push({ type: "text", content: event.content });
        } else if (event.type === "tool") {
          const agent = ensureAgent();
          agent.blocks = agent.blocks.filter((block) => block.type !== "thinking");
          agent.blocks.push(event.block);
        } else if (event.type === "error") {
          const agent = ensureAgent();
          agent.blocks = [{ type: "text", content: event.error }];
        } else if (event.type === "done") {
          const agent = ensureAgent();
          agent.blocks = agent.blocks.filter((block) => block.type !== "thinking");
        }
        return next;
      });
    };
    let cleanup: (() => void) | undefined;
    void listenChat(applyEvent).then((unlisten) => {
      cleanup = unlisten;
    });
    return () => cleanup?.();
  }, [sessionId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleUserMessage = (text: string) => {
    setMessages((current) => [...current, { kind: "user", time: nowTime(), text }]);
  };

  return (
    <>
      <div className="chat-scroll" ref={scrollRef}>
        <div className="chat-inner">
          {messages.map((m, i) => <Message key={m.id ?? i} msg={m} />)}
        </div>
      </div>
      <Composer sessionId={sessionId} onUserMessage={handleUserMessage} onError={onError} />
    </>
  );
}
