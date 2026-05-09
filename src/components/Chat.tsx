import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MESSAGES } from "../lib/fixtures";
import { agentsList, chatCancel, chatSend, listenChat, sessionHistory } from "../lib/openclaw";
import { applyChatEvent } from "../lib/chatReducer";
import { FULL_HISTORY_LIMIT, RECENT_HISTORY_LIMIT, agentIdFromSession, getHistoryCache, isHistoryGenerationCurrent, mapHistoryMessages, mergeHistoryMessages, nextHistoryGeneration, nowTime, preservedScrollTop, setHistoryCache, updateHistoryCache, type HistoryLoadStatus } from "../lib/chatHistory";
import { durationLabel, exitCodeLabel, formatActivityValue, objectValue, stringValue, subagentName, terminalCommand, toolIconFor, toolStatusClass, toolStatusIcon, toolStatusLabel } from "../lib/chatTools";
import type { ChatEvent, ChatMessage, ChatSendOptions, ChatTurnState, ToolBlock } from "../lib/types";
import { Composer } from "./Composer";
import { Icon } from "./Icons";
import { RefreshButton, RefreshError, RefreshMeta } from "./RefreshStatus";

interface PendingTurn {
  sessionId: string;
  userId: string;
  messageId: string;
  text: string;
  options: ChatSendOptions;
}

let turnSeq = 0;

function nextTurnId(sessionId: string): string {
  turnSeq += 1;
  return `turn-${Date.now().toString(36)}-${turnSeq.toString(36)}-${sessionId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function optimisticUserMessage(turn: PendingTurn): ChatMessage {
  return { id: turn.userId, kind: "user", time: nowTime(), text: turn.text };
}

function optimisticAssistantMessage(turn: PendingTurn): ChatMessage {
  return {
    id: turn.messageId,
    kind: "agent",
    time: nowTime(),
    turnState: "sending",
    blocks: [{ type: "thinking", status: "sending", label: "sending" }],
  };
}

function turnEventKey(sessionId: string, messageId: string): string {
  return `${sessionId}:${messageId}`;
}

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

function Thinking({ status, label }: { status?: ChatTurnState; label?: string }) {
  const text = label || status || "thinking";
  return (
    <div className="thinking">
      {text}
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
          if (b.type === "tool") return <ToolCard key={b.activity_id ?? b.id ?? i} block={b} />;
          return <Thinking key={i} status={b.status} label={b.label} />;
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
  const [turnState, setTurnState] = useState<ChatTurnState | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);

  const prevSessionRef = useRef<string | null>(null);
  const activeSessionRef = useRef(sessionId);
  const messagesRef = useRef<ChatMessage[]>([]);
  const activeTurnRef = useRef<PendingTurn | null>(null);
  const queuedTurnsRef = useRef<PendingTurn[]>([]);
  const ignoredTurnEventKeysRef = useRef<Set<string>>(new Set());
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

  const replaceMessagesForSession = useCallback((targetSession: string, updater: (current: ChatMessage[]) => ChatMessage[]) => {
    if (activeSessionRef.current === targetSession) {
      setMessages((current) => {
        const next = updater(current);
        const cached = getHistoryCache(targetSession);
        if (cached) setHistoryCache(targetSession, { ...cached, messages: next });
        else setHistoryCache(targetSession, { messages: next, status: "ready", generation: nextHistoryGeneration(targetSession), updatedAt: Date.now() });
        return next;
      });
      return;
    }

    const cached = getHistoryCache(targetSession);
    const next = updater(cached?.messages ?? []);
    if (cached) setHistoryCache(targetSession, { ...cached, messages: next });
    else setHistoryCache(targetSession, { messages: next, status: "ready", generation: nextHistoryGeneration(targetSession), updatedAt: Date.now() });
  }, []);

  const applyEventsForSession = useCallback((targetSession: string, events: ChatEvent[], stick = true) => {
    if (activeSessionRef.current === targetSession && stick) markScrollStickIfNeeded();
    replaceMessagesForSession(targetSession, (current) => events.reduce((messages, event) => applyChatEvent(messages, targetSession, event), current));
  }, [markScrollStickIfNeeded, replaceMessagesForSession]);

  const markTurnCanceling = useCallback((turn: PendingTurn) => {
    replaceMessagesForSession(turn.sessionId, (current) => current.map((message) => {
      if (message.kind !== "agent" || message.id !== turn.messageId) return message;
      const hasThinking = message.blocks.some((block) => block.type === "thinking");
      const blocks = hasThinking
        ? message.blocks.map((block) => block.type === "thinking" ? { type: "thinking" as const, status: "canceling" as const, label: "canceling" } : block)
        : [...message.blocks, { type: "thinking" as const, status: "canceling" as const, label: "canceling" }];
      return { ...message, turnState: "canceling" as const, blocks };
    }));
  }, [replaceMessagesForSession]);

  const startTurn = useCallback((turn: PendingTurn) => {
    activeTurnRef.current = turn;
    setTurnState("sending");
    markScrollBottom();
    replaceMessagesForSession(turn.sessionId, (current) => [...current, optimisticAssistantMessage(turn)]);

    void chatSend(turn.sessionId, turn.text, { ...turn.options, messageId: turn.messageId }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      const doneEvent: ChatEvent = { type: "done", session_id: turn.sessionId, message_id: turn.messageId };
      applyEventsForSession(turn.sessionId, [
        { type: "error", session_id: turn.sessionId, message_id: turn.messageId, error: message },
        doneEvent,
      ]);
      if (activeTurnRef.current?.messageId === turn.messageId) {
        activeTurnRef.current = null;
        const next = queuedTurnsRef.current.shift();
        setQueuedCount(queuedTurnsRef.current.length);
        if (next && activeSessionRef.current === next.sessionId) startTurn(next);
        else setTurnState(null);
      }
      onError(message);
    });
  }, [applyEventsForSession, markScrollBottom, onError, replaceMessagesForSession]);

  const completeActiveTurn = useCallback((event: ChatEvent) => {
    if (event.type !== "done") return;
    const active = activeTurnRef.current;
    if (!active || event.session_id !== active.sessionId) return;
    if (event.message_id && event.message_id !== active.messageId) return;

    activeTurnRef.current = null;
    const next = queuedTurnsRef.current.shift();
    setQueuedCount(queuedTurnsRef.current.length);
    if (next && activeSessionRef.current === next.sessionId) {
      startTurn(next);
    } else {
      setTurnState(null);
    }
  }, [startTurn]);

  useEffect(() => {
    activeSessionRef.current = sessionId;
    const prev = prevSessionRef.current;
    prevSessionRef.current = sessionId;
    if (prev && prev !== sessionId) {
      void chatCancel(prev).catch(() => undefined);
      const active = activeTurnRef.current;
      if (active?.sessionId === prev) {
        ignoredTurnEventKeysRef.current.add(turnEventKey(active.sessionId, active.messageId));
        applyEventsForSession(prev, [
          { type: "error", session_id: prev, message_id: active.messageId, error: "Turn interrupted because the session was switched." },
          { type: "done", session_id: prev, message_id: active.messageId },
        ], false);
      }
      for (const turn of queuedTurnsRef.current.filter((queued) => queued.sessionId === prev)) {
        ignoredTurnEventKeysRef.current.add(turnEventKey(turn.sessionId, turn.messageId));
        applyEventsForSession(prev, [
          { type: "error", session_id: prev, message_id: turn.messageId, error: "Queued message was not sent because the session was switched." },
          { type: "done", session_id: prev, message_id: turn.messageId },
        ], false);
      }
      activeTurnRef.current = null;
      queuedTurnsRef.current = [];
      setQueuedCount(0);
      setTurnState(null);
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
        setMessages((current) => {
          const merged = mergeHistoryMessages(current, recent);
          setHistoryCache(sessionId, { messages: merged, status: "hydrating", generation, updatedAt: cached?.updatedAt });
          return merged;
        });
        setHistoryStatus("hydrating");

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
  }, [sessionId, useMock, refreshRequest, onError, markScrollBottom, markScrollPreserve, applyEventsForSession]);

  const applyEvent = useCallback((event: ChatEvent) => {
    if (event.session_id !== sessionId) return;
    if (event.message_id && ignoredTurnEventKeysRef.current.has(turnEventKey(event.session_id, event.message_id))) return;
    applyEventsForSession(sessionId, [event]);

    const active = activeTurnRef.current;
    const activeEvent = active && event.session_id === active.sessionId && (!event.message_id || event.message_id === active.messageId);
    if (!activeEvent) return;

    if (event.type === "start" || event.type === "token" || event.type === "tool") setTurnState("working");
    if (event.type === "error") setTurnState("failed");
    if (event.type === "done") completeActiveTurn(event);
  }, [applyEventsForSession, completeActiveTurn, sessionId]);

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

  const handleSubmit = (text: string, options: ChatSendOptions) => {
    const messageId = nextTurnId(sessionId);
    const turn: PendingTurn = {
      sessionId,
      userId: `${messageId}-user`,
      messageId,
      text,
      options,
    };

    markScrollBottom();
    replaceMessagesForSession(sessionId, (current) => [...current, optimisticUserMessage(turn)]);

    if (activeTurnRef.current) {
      queuedTurnsRef.current = [...queuedTurnsRef.current, turn];
      setQueuedCount(queuedTurnsRef.current.length);
      return;
    }

    startTurn(turn);
  };

  const cancelActiveTurn = () => {
    const turn = activeTurnRef.current;
    if (!turn) return;
    setTurnState("canceling");
    markTurnCanceling(turn);
    ignoredTurnEventKeysRef.current.add(turnEventKey(turn.sessionId, turn.messageId));
    void chatCancel(turn.sessionId)
      .catch((error) => onError(error instanceof Error ? error.message : String(error)))
      .finally(() => {
        const doneEvent: ChatEvent = { type: "done", session_id: turn.sessionId, message_id: turn.messageId };
        applyEventsForSession(turn.sessionId, [
          { type: "error", session_id: turn.sessionId, message_id: turn.messageId, error: "Turn canceled." },
          doneEvent,
        ]);
        completeActiveTurn(doneEvent);
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
      <Composer
        sessionId={sessionId}
        turnState={turnState}
        queuedCount={queuedCount}
        onSubmit={handleSubmit}
        onCancel={cancelActiveTurn}
        onError={onError}
      />
    </>
  );
}
