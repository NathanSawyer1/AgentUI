import { useEffect, useMemo, useRef, useState } from "react";
import { appendLogLines, filterLogs, FULL_LOG_LIMIT, INITIAL_LOG_LIMIT, type LogLine, preservedLogScrollTop, shouldStickToBottom } from "../lib/logs";
import { listenLogs, logsStop, logsTail } from "../lib/openclaw";
import { Icon } from "../components/Icons";
import type { JsonValue } from "../lib/types";

export function Logs() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [query, setQuery] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [error, setError] = useState("");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const acceptNextRunRef = useRef(false);
  const completedRunsRef = useRef(new Set<string>());
  const hydrateAfterRunRef = useRef<{ follow: boolean } | null>(null);
  const preserveScrollRef = useRef<{ top: number; height: number; stick: boolean } | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listenLogs((event) => {
      setRunId((current) => {
        const accepting = event.runId === current || (current === null && acceptNextRunRef.current);
        if (!accepting) return current;
        acceptNextRunRef.current = false;
        if (event.error) setError(event.error);
        if (event.line) {
          const record = event.record as Record<string, JsonValue> | undefined;
          const level = record && typeof record.level === "string" ? record.level : undefined;
          setLines((items) => appendLogLines(items, [{ text: event.line!, level }]));
        }
        if (event.done) {
          completedRunsRef.current.add(event.runId);
          const hydrate = hydrateAfterRunRef.current;
          hydrateAfterRunRef.current = null;
          if (hydrate) void startRun(FULL_LOG_LIMIT, hydrate.follow, false);
          return null;
        }
        return event.runId;
      });
    }).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    void start(follow);
    return () => {
      setRunId((id) => {
        if (id) void logsStop(id).catch(() => undefined);
        return null;
      });
    };
  }, []);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const preserve = preserveScrollRef.current;
    preserveScrollRef.current = null;
    if (preserve) {
      const next = preservedLogScrollTop(preserve.top, preserve.height, body.scrollHeight, preserve.stick);
      body.scrollTop = next ?? body.scrollHeight;
    } else if (follow || shouldStickToBottom(body.scrollTop, body.clientHeight, body.scrollHeight)) {
      body.scrollTop = body.scrollHeight;
    }
  }, [lines]);

  const filtered = useMemo(() => {
    return filterLogs(lines, query);
  }, [lines, query]);

  async function startRun(limit: number, nextFollow: boolean, hydrateAfter: boolean) {
    if (runId) await logsStop(runId).catch(() => undefined);
    setError("");
    const body = bodyRef.current;
    if (body) {
      preserveScrollRef.current = {
        top: body.scrollTop,
        height: body.scrollHeight,
        stick: nextFollow || shouldStickToBottom(body.scrollTop, body.clientHeight, body.scrollHeight),
      };
    }
    acceptNextRunRef.current = true;
    hydrateAfterRunRef.current = hydrateAfter ? { follow: nextFollow } : null;
    try {
      const run = await logsTail(limit, nextFollow);
      setRunId((current) => current ?? (completedRunsRef.current.has(run.runId) ? null : run.runId));
      setFollow(nextFollow);
    } catch (err) {
      acceptNextRunRef.current = false;
      hydrateAfterRunRef.current = null;
      setRunId(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function start(nextFollow: boolean) {
    await startRun(INITIAL_LOG_LIMIT, false, nextFollow);
  }

  return (
    <div className="logs-panel">
      <div className="panel-head">
        <div className="panel-title"><Icon name="list" size={12} /> Logs</div>
        <div className="panel-spacer"></div>
        <button className="panel-btn text" onClick={() => void start(!follow)} title={follow ? "Pause live logs" : "Resume live logs"}>{follow && runId ? "Pause" : "Resume"}</button>
        <button className="panel-btn text" onClick={() => setLines([])} title="Clear logs">Clear</button>
      </div>
      <div className="logs-toolbar">
        <Icon name="search" size={12} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search logs" />
        <span>{runId ? (follow ? "following" : "loaded") : "stopped"}</span>
      </div>
      {error && <div className="error-banner inline">{error}</div>}
      <div className="logs-body" ref={bodyRef}>
        {filtered.length === 0 ? (
          <div className="panel-empty">No log lines.</div>
        ) : filtered.map((line, index) => (
          <div key={index} className={"log-line " + (line.level ?? "")}>
            <span className="log-index">{index + 1}</span>
            <span className="log-text">{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
