import { useEffect, useRef, useState } from "react";
import { listenTerminal, terminalCancel, terminalRun, workspaceStatus } from "../lib/openclaw";
import type { TermLine } from "../lib/types";
import { Icon } from "../components/Icons";
import { nextRecentCommands, terminalExitLine, workspaceCwdInfoLine, workspaceCwdLabel } from "../lib/terminalState";

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
  const [recent, setRecent] = useState<string[]>([]);
  const [cwd, setCwd] = useState(".");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const acceptNextRunRef = useRef(false);
  const completedRunsRef = useRef(new Set<string>());
  const canceledRunsRef = useRef(new Set<string>());
  const commandByRunRef = useRef(new Map<string, string>());
  const pendingCommandRef = useRef<string | null>(null);
  const runIdRef = useRef<string | null>(null);

  useEffect(() => {
    runIdRef.current = runId;
  }, [runId]);

  useEffect(() => {
    let cancelled = false;
    void workspaceStatus()
      .then((workspace) => {
        if (!cancelled) {
          setCwd(workspaceCwdLabel(workspace));
          setLines((current) => [...current, workspaceCwdInfoLine(workspace)]);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLines((current) => [...current, { kind: "warn", text: `could not read workspace cwd; using app launch cwd (${error instanceof Error ? error.message : String(error)})` }]);
        }
      });
    return () => { cancelled = true; };
  }, []);

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
          const command = commandByRunRef.current.get(event.runId) || pendingCommandRef.current || undefined;
          const canceled = canceledRunsRef.current.has(event.runId);
          setLines((current) => [...current, terminalExitLine(event.exitCode, command, canceled)]);
          completedRunsRef.current.add(event.runId);
          canceledRunsRef.current.delete(event.runId);
          commandByRunRef.current.delete(event.runId);
          return null;
        }
        return event.runId;
      });
    }).then((fn) => { unlisten = fn; });
    return () => {
      unlisten?.();
      const id = runIdRef.current;
      if (id) void terminalCancel(id).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [lines]);

  const runCmd = async () => {
    const command = input.trim();
    await runCommandText(command);
  };

  const rerun = (command: string) => {
    if (runId) return;
    void runCommandText(command);
  };

  const runCommandText = async (command: string) => {
    if (!command || runId) return;
    setInput("");
    setRecent((current) => nextRecentCommands(current, command));
    setLines((current) => [...current, { kind: "prompt", cwd, cmd: command }]);
    pendingCommandRef.current = command;
    acceptNextRunRef.current = true;
    try {
      const started = await terminalRun(command, cwd === "." ? undefined : cwd);
      commandByRunRef.current.set(started.runId, command);
      pendingCommandRef.current = null;
      setRunId((current) => current ?? (completedRunsRef.current.has(started.runId) ? null : started.runId));
    } catch (error) {
      acceptNextRunRef.current = false;
      pendingCommandRef.current = null;
      setLines((current) => [...current, { kind: "err", text: error instanceof Error ? error.message : String(error) }]);
    }
  };

  const cancel = async () => {
    if (!runId) return;
    const id = runId;
    setRunId(null);
    canceledRunsRef.current.add(id);
    const command = commandByRunRef.current.get(id) || pendingCommandRef.current || "command";
    setLines((current) => [...current, { kind: "warn", text: `cancel requested for \`${command}\`` }]);
    await terminalCancel(id).catch((error) => setLines((current) => [...current, { kind: "err", text: String(error) }]));
  };

  return (
    <div className={"terminal-wrap " + (placement === "bottom" ? "bottom" : "")} style={{ height: placement === "bottom" ? height + "px" : "100%" }}>
      <div className="term-resize-top"></div>
      <div className="term-head">
        <div className="term-tabs">
          <div className="term-tab active"><Icon name="terminal" size={10} /><span>{runId ? "running" : "command runner"}</span></div>
        </div>
        <div className="panel-spacer"></div>
        <button className="panel-btn text" onClick={() => void navigator.clipboard?.writeText(lines.map((line) => line.kind === "prompt" ? `${line.cwd ?? "."} > ${line.cmd ?? ""}` : line.text ?? "").join("\n")).catch(() => undefined)} title="Copy output">Copy</button>
        {recent[0] && <button className="panel-btn text" disabled={Boolean(runId)} onClick={() => rerun(recent[0])} title="Rerun last command">Rerun</button>}
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
          <span className="cwd">{cwd}</span>
          <span className="prompt">&gt;</span>
          <input value={input} disabled={Boolean(runId)} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void runCmd(); }} style={{ flex: 1, color: "var(--fg-0)" }} autoFocus />
        </div>
        {!runId && recent.length > 0 && (
          <div className="term-recent">
            {recent.map((command) => <button key={command} onClick={() => rerun(command)}>{command}</button>)}
          </div>
        )}
      </div>
    </div>
  );
}
