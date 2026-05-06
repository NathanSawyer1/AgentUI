import { useEffect, useRef, useState } from "react";
import { listenTerminal, terminalCancel, terminalRun } from "../lib/openclaw";
import type { TermLine } from "../lib/types";
import { Icon } from "../components/Icons";

interface TerminalProps {
  onClose: () => void;
  placement: "right" | "bottom";
  onTogglePlacement: () => void;
  height: number;
  onHeightChange: (height: number) => void;
}

export function Terminal({ onClose, placement, onTogglePlacement, height }: TerminalProps) {
  const [input, setInput] = useState("");
  const [lines, setLines] = useState<TermLine[]>([{ kind: "info", text: "Command runner - sh -lc in the workspace cwd" }]);
  const [runId, setRunId] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const acceptNextRunRef = useRef(false);
  const completedRunsRef = useRef(new Set<string>());

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listenTerminal((event) => {
      setRunId((currentRunId) => {
        const accepting = event.runId === currentRunId || (currentRunId === null && acceptNextRunRef.current);
        if (!accepting) return currentRunId;
        acceptNextRunRef.current = false;
        if (event.line != null) {
          setLines((current) => [...current, { kind: event.stream === "stderr" ? "err" : "out", text: event.line }]);
        }
        if (event.error) {
          setLines((current) => [...current, { kind: "err", text: event.error }]);
        }
        if (event.done) {
          setLines((current) => [...current, { kind: event.exitCode === 0 ? "ok" : "warn", text: `process exited ${event.exitCode ?? "unknown"}` }]);
          completedRunsRef.current.add(event.runId);
          return null;
        }
        return event.runId;
      });
    }).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [lines]);

  const runCmd = async () => {
    const command = input.trim();
    if (!command || runId) return;
    setInput("");
    setLines((current) => [...current, { kind: "prompt", cwd: ".", cmd: command }]);
    acceptNextRunRef.current = true;
    try {
      const started = await terminalRun(command);
      setRunId((current) => current ?? (completedRunsRef.current.has(started.runId) ? null : started.runId));
    } catch (error) {
      acceptNextRunRef.current = false;
      setLines((current) => [...current, { kind: "err", text: error instanceof Error ? error.message : String(error) }]);
    }
  };

  const cancel = async () => {
    if (!runId) return;
    const id = runId;
    setRunId(null);
    setLines((current) => [...current, { kind: "warn", text: "cancel requested" }]);
    await terminalCancel(id).catch((error) => setLines((current) => [...current, { kind: "err", text: String(error) }]));
  };

  return (
    <div className={"terminal-wrap " + (placement === "bottom" ? "bottom" : "")} style={{ height: placement === "bottom" ? height + "px" : "100%" }}>
      <div className="term-resize-top"></div>
      <div className="term-head">
        <div className="term-tabs">
          <div className="term-tab active"><Icon name="terminal" size={10} /><span>command runner</span></div>
        </div>
        <div className="panel-spacer"></div>
        {runId && <button className="panel-btn" onClick={cancel} title="Cancel command"><Icon name="x" size={12} /></button>}
        <button className="panel-btn" onClick={onTogglePlacement} title={placement === "bottom" ? "Dock right" : "Dock bottom"}><Icon name="split" size={12} /></button>
        <button className="panel-btn" onClick={onClose} title="Close"><Icon name="x" size={12} /></button>
      </div>
      <div className="term-body" ref={bodyRef}>
        {lines.map((l, i) => {
          if (l.kind === "prompt") {
            return <div key={i} className="term-line"><span className="cwd">{l.cwd}</span><span className="prompt">&gt;</span><span>{l.cmd}</span></div>;
          }
          const cls = l.kind === "muted" ? "muted" : l.kind === "warn" ? "warn" : l.kind === "err" ? "err" : l.kind === "ok" ? "ok" : "";
          return <div key={i} className="term-line"><span className={cls}>{l.text || "\u00A0"}</span></div>;
        })}
        <div className="term-line">
          <span className="cwd">.</span>
          <span className="prompt">&gt;</span>
          <input value={input} disabled={Boolean(runId)} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void runCmd(); }} style={{ flex: 1, color: "var(--fg-0)" }} autoFocus />
        </div>
      </div>
    </div>
  );
}
