import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MESSAGES } from "../lib/fixtures";
import { agentsList, chatCancel, listenChat, sessionHistory } from "../lib/openclaw";
import { applyChatEvent } from "../lib/chatReducer";
import { FULL_HISTORY_LIMIT, RECENT_HISTORY_LIMIT, agentIdFromSession, getHistoryCache, isHistoryGenerationCurrent, mapHistoryMessages, mergeHistoryMessages, nextHistoryGeneration, preservedScrollTop, setHistoryCache, updateHistoryCache, type HistoryLoadStatus } from "../lib/chatHistory";
import { durationLabel, exitCodeLabel, formatActivityValue, objectValue, stringValue, subagentName, terminalCommand, toolIconFor, toolStatusClass, toolStatusIcon, toolStatusLabel } from "../lib/chatTools";
import type { ChatEvent, ChatMessage, ToolBlock } from "../lib/types";
import { Composer } from "./Composer";
import { Icon } from "./Icons";
import { RefreshButton, RefreshError, RefreshMeta } from "./RefreshStatus";

// ---------------------------------------------------------------------------
// Tool card
// ---------------------------------------------------------------------------

function ToolCard({ block, startOpen = false }: { block: ToolBlock; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen || block.status !== "ok");
  const [detailOpen, setDetailOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const label = block.title || block.name || "Activity";
  const summary = block.summary || block.arg || block.name || "OpenClaw activity";
  return (
    <div className={"tool" + (open ? " open" : "")}>
      <div className="tool-head">
        <button className="tool-toggle" type="button" onClick={() => setOpen(!open)}>
          <span className="tool-icon"><Icon name={toolIconFor(block)} size={11} /></span>
          <span className="tool-name">{label}</span>
          <span className="tool-summary">{summary}</span>
          <span className={"tool-status " + toolStatusClass(block)}>
            <Icon name={toolStatusIcon(block)} size={11} />
            {toolStatusLabel(block)}
          </span>
          <span className="tool-chev"><Icon name="chevRight" size={11} /></span>
        </button>
        <button className="tool-expand" type="button" title="Open expanded activity view" aria-label="Open expanded activity view" onClick={() => setDetailOpen(true)}>
          <Icon name="popout" size={12} />
        </button>
      </div>
      {open && (
        <div className="tool-body">
          <ToolHighlights block={block} compact />
          <ActivitySection title="Input" value={block.input} />
          <ActivitySection title="Output" value={block.output} scroll />
          <ActivitySection title="Error" value={block.error} tone="err" scroll />
          <ActivitySection title="Metadata" value={block.metadata} />
          {(!block.input && !block.output && !block.error && !block.metadata && block.preview?.length) ? (
            <div className="tool-section">
              <div className="tool-section-title">Preview</div>
              <pre className="tool-pre">{block.preview.map((line) => line.t).join("\n")}</pre>
            </div>
          ) : null}
          {block.raw ? (
            <div className="tool-section">
              <button className="tool-raw-toggle" type="button" onClick={() => setRawOpen(!rawOpen)}>
                <Icon name="chevRight" size={10} /> raw
              </button>
              {rawOpen ? <pre className="tool-pre tool-raw">{formatActivityValue(block.raw)}</pre> : null}
            </div>
          ) : null}
        </div>
      )}
      {detailOpen ? <ToolDetailModal block={block} onClose={() => setDetailOpen(false)} /> : null}
    </div>
  );
}

function ToolDetailModal({ block, onClose }: { block: ToolBlock; onClose: () => void }) {
  const label = block.title || block.name || "Activity";

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="tool-modal-backdrop" onMouseDown={onClose}>
      <div className="tool-modal" role="dialog" aria-modal="true" aria-label={`${label} details`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="tool-modal-head">
          <span className="tool-icon"><Icon name={toolIconFor(block)} size={13} /></span>
          <div className="tool-modal-title">
            <div>{label}</div>
            <span>{block.summary || block.arg || block.name || "OpenClaw activity"}</span>
          </div>
          <span className={"tool-status " + toolStatusClass(block)}>
            <Icon name={toolStatusIcon(block)} size={11} />
            {toolStatusLabel(block)}
          </span>
          <button className="tool-modal-close" type="button" title="Close" aria-label="Close activity details" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="tool-modal-body">
          <ToolHighlights block={block} />
          <ActivitySection title="Input" value={block.input} scroll />
          <ActivitySection title="Output" value={block.output} scroll />
          <ActivitySection title="Error" value={block.error} tone="err" scroll />
          <ActivitySection title="Metadata" value={block.metadata} scroll />
          <ActivitySection title="Raw event" value={block.raw} scroll />
        </div>
      </div>
    </div>
  );
}

function ToolHighlights({ block, compact = false }: { block: ToolBlock; compact?: boolean }) {
  const rows: Array<{ label: string; value: string }> = [];
  const command = terminalCommand(block);
  const subagent = subagentName(block);
  const cwd = stringValue(objectValue(block.metadata, "cwd"));
  const model = stringValue(objectValue(block.metadata, "model"));
  const duration = durationLabel(block);
  const exitCode = exitCodeLabel(block);
  const session = stringValue(objectValue(block.metadata, "sessionId")) || stringValue(objectValue(block.metadata, "session_id"));
  const path = stringValue(objectValue(block.input, "path")) || stringValue(objectValue(block.input, "file"));
  const url = stringValue(objectValue(block.input, "url")) || stringValue(objectValue(block.raw, "url"));

  if (block.kind === "terminal" && command) rows.push({ label: "Command", value: command });
  if (block.kind === "subagent" && subagent) rows.push({ label: "Agent", value: subagent });
  if (block.kind === "subagent" && session) rows.push({ label: "Session", value: session });
  if (block.kind === "subagent" && model) rows.push({ label: "Model", value: model });
  if (block.kind === "file" && path) rows.push({ label: "Path", value: path });
  if (block.kind === "network" && url) rows.push({ label: "URL", value: url });
  if (cwd) rows.push({ label: "CWD", value: cwd });
  if (duration) rows.push({ label: "Duration", value: duration });
  if (exitCode) rows.push({ label: "Exit", value: exitCode });

  if (!rows.length) return null;
  return (
    <div className={"tool-facts" + (compact ? " compact" : "")}>
      {rows.map((row) => (
        <div className="tool-fact" key={`${row.label}:${row.value}`}>
          <span>{row.label}</span>
          <code>{row.value}</code>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity section
// ---------------------------------------------------------------------------

function ActivitySection({ title, value, tone, scroll = false }: { title: string; value: unknown; tone?: "err"; scroll?: boolean }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="tool-section">
      <div className="tool-section-title">{title}</div>
      <pre className={"tool-pre" + (tone ? ` ${tone}` : "") + (scroll ? " scroll" : "")}>{formatActivityValue(value)}</pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thinking indicator
// ---------------------------------------------------------------------------

function Thinking() {
  return (
    <div className="thinking">
      thinking
      <span className="thinking-dots"><span></span><span></span><span></span></span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline text rendering
// ---------------------------------------------------------------------------

function renderInline(text: string) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("`") && p.endsWith("`")) return <code key={i}>{p.slice(1, -1)}</code>;
    return <span key={i}>{p}</span>;
  });
}

// ---------------------------------------------------------------------------
// Message renderer
// ---------------------------------------------------------------------------

const Message = memo(function Message({ msg }: { msg: ChatMessage }) {
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
      <div className="content">
        {msg.blocks.map((b, i) => {
          if (b.type === "text") return <p key={i}>{renderInline(b.content)}</p>;
          if (b.type === "tool") return <ToolCard key={i} block={b} />;
          return <Thinking key={i} />;
        })}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Agent display name hook
// ---------------------------------------------------------------------------

function useAgentDisplayName(sessionId: string) {
  const agentId = agentIdFromSession(sessionId);
  const [name, setName] = useState(agentId ?? "openclaw");
  useEffect(() => {
    if (!agentId) return;
    setName(agentId);
    agentsList()
      .then((agents) => {
        const match = agents.find((a) => a.id === agentId);
        if (match) setName(match.name);
      })
      .catch(() => undefined);
  }, [agentId]);
  return name;
}

// ---------------------------------------------------------------------------
// Main Chat component
// ---------------------------------------------------------------------------

export function Chat({ sessionId, useMock, onError }: { sessionId: string; useMock: boolean; onError: (message: string) => void }) {
  const agentName = useAgentDisplayName(sessionId);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyStatus, setHistoryStatus] = useState<HistoryLoadStatus>("initial");
  const [historyError, setHistoryError] = useState("");
  const [historyStale, setHistoryStale] = useState(false);
  const [historyUpdatedAt, setHistoryUpdatedAt] = useState<number | undefined>(undefined);
  const [refreshRequest, setRefreshRequest] = useState({ sessionId: "", nonce: 0 });

  const prevSessionRef = useRef<string | null>(null);
  const activeSessionRef = useRef(sessionId);
  const messagesRef = useRef<ChatMessage[]>([]);
  const scrollModeRef = useRef<"bottom" | "preserve" | "stick" | "none">("bottom");
  const scrollSnapshotRef = useRef<{ height: number; top: number } | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const isNearBottom = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return true;
    return node.scrollHeight - node.scrollTop - node.clientHeight < 80;
  }, []);

  const markScrollBottom = useCallback(() => {
    scrollModeRef.current = "bottom";
  }, []);

  const markScrollPreserve = useCallback(() => {
    const node = scrollRef.current;
    scrollSnapshotRef.current = node ? { height: node.scrollHeight, top: node.scrollTop } : null;
    scrollModeRef.current = "preserve";
  }, []);

  const markScrollStickIfNeeded = useCallback(() => {
    scrollModeRef.current = isNearBottom() ? "stick" : "none";
  }, [isNearBottom]);

  useEffect(() => {
    activeSessionRef.current = sessionId;
    const prev = prevSessionRef.current;
    prevSessionRef.current = sessionId;
    if (prev && prev !== sessionId) {
      void chatCancel(prev).catch(() => undefined);
    }
    setHistoryError("");
    setHistoryStale(false);
    if (useMock) {
      markScrollBottom();
      setMessages(MESSAGES);
      setHistoryStatus("ready");
      setHistoryUpdatedAt(Date.now());
      return;
    }

    const cached = getHistoryCache(sessionId);
    const generation = nextHistoryGeneration(sessionId);
    const forceRefresh = refreshRequest.sessionId === sessionId && refreshRequest.nonce > 0;
    let cancelled = false;

    if (cached) {
      setHistoryUpdatedAt(cached.updatedAt);
      if (forceRefresh) markScrollPreserve();
      else markScrollBottom();
      setMessages(cached.messages);
      setHistoryStatus(forceRefresh ? "refreshing" : cached.status);
      if (!forceRefresh && cached.status === "ready") return;
    } else {
      markScrollBottom();
      setMessages([]);
      setHistoryStatus("initial");
    }

    updateHistoryCache(sessionId, { generation, status: forceRefresh ? "refreshing" : cached?.status ?? "initial", messages: cached?.messages ?? [], updatedAt: cached?.updatedAt });

    const isCurrent = () => !cancelled && activeSessionRef.current === sessionId && isHistoryGenerationCurrent(sessionId, generation);

    void sessionHistory(sessionId, RECENT_HISTORY_LIMIT)
      .then((history) => {
        if (!isCurrent()) return;
        const recent = mapHistoryMessages(history);
        if (forceRefresh) markScrollPreserve();
        else markScrollBottom();
        setMessages(recent);
        setHistoryStatus("hydrating");
        setHistoryCache(sessionId, { messages: recent, status: "hydrating", generation, updatedAt: cached?.updatedAt });

        void sessionHistory(sessionId, FULL_HISTORY_LIMIT)
          .then((fullHistory) => {
            if (!isCurrent()) return;
            const full = mapHistoryMessages(fullHistory);
            markScrollPreserve();
            setMessages((current) => {
              const merged = mergeHistoryMessages(current, full);
              const updatedAt = Date.now();
              setHistoryCache(sessionId, { messages: merged, status: "ready", generation, updatedAt });
              setHistoryUpdatedAt(updatedAt);
              return merged;
            });
            setHistoryStatus("ready");
            setHistoryStale(false);
          })
          .catch((error) => {
            if (!isCurrent()) return;
            const message = error instanceof Error ? error.message : String(error);
            setHistoryError(message);
            setHistoryStatus("error");
            setHistoryStale(messagesRef.current.length > 0);
            updateHistoryCache(sessionId, { generation, status: "error" });
            onError(message);
          });
      })
      .catch((error) => {
        if (!isCurrent()) return;
        const message = error instanceof Error ? error.message : String(error);
        setHistoryError(message);
        setHistoryStatus("error");
        setHistoryStale(messagesRef.current.length > 0);
        updateHistoryCache(sessionId, { generation, status: "error" });
        onError(message);
      });
    return () => { cancelled = true; };
  }, [sessionId, useMock, refreshRequest, onError, markScrollBottom, markScrollPreserve]);

  const applyEvent = useCallback((event: ChatEvent) => {
    markScrollStickIfNeeded();
    setMessages((current) => {
      const next = applyChatEvent(current, sessionId, event);
      const cached = getHistoryCache(sessionId);
      if (cached) setHistoryCache(sessionId, { ...cached, messages: next });
      return next;
    });
  }, [sessionId, markScrollStickIfNeeded]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void listenChat(applyEvent).then((unlisten) => {
      cleanup = unlisten;
    }).catch((error) => onError(error instanceof Error ? error.message : String(error)));
    return () => cleanup?.();
  }, [applyEvent, onError]);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const mode = scrollModeRef.current;
    if (mode === "bottom" || mode === "stick") {
      node.scrollTop = node.scrollHeight;
    } else if (mode === "preserve") {
      const snapshot = scrollSnapshotRef.current;
      if (snapshot) node.scrollTop = preservedScrollTop(snapshot.top, snapshot.height, node.scrollHeight);
    }
    scrollModeRef.current = "none";
    scrollSnapshotRef.current = null;
  }, [messages]);

  const handleUserMessage = (text: string) => {
    markScrollBottom();
    setMessages((current) => {
      const next: ChatMessage[] = [...current, { kind: "user", time: new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date()), text }];
      const cached = getHistoryCache(sessionId);
      if (cached) setHistoryCache(sessionId, { ...cached, messages: next });
      return next;
    });
  };

  const refreshHistory = () => {
    markScrollPreserve();
    setRefreshRequest((current) => ({ sessionId, nonce: current.nonce + 1 }));
  };

  return (
    <>
      <div className="chat-agent-header">
        <span>{agentName}</span>
        {!useMock && (
          <div className="chat-history-actions">
            <RefreshMeta loading={historyStatus === "hydrating" || historyStatus === "refreshing"} updatedAt={historyUpdatedAt} stale={historyStale} />
            <RefreshButton loading={historyStatus === "hydrating" || historyStatus === "refreshing"} onClick={refreshHistory} />
          </div>
        )}
      </div>
      <div className="chat-scroll" ref={scrollRef}>
        <div className="chat-inner">
          {historyStatus === "hydrating" ? <div className="history-loading">Loading older messages...</div> : null}
          {historyStatus === "refreshing" ? <div className="history-loading">Refreshing history...</div> : null}
          <RefreshError message={historyError} stale={historyStale} onRetry={refreshHistory} />
          {messages.map((m, i) => <Message key={m.id ?? i} msg={m} />)}
        </div>
      </div>
      <Composer sessionId={sessionId} onUserMessage={handleUserMessage} onChatEvents={(events) => events.forEach(applyEvent)} onError={onError} />
    </>
  );
}
