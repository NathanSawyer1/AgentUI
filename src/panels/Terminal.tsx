import { useEffect, useRef, useState } from "react";
import { TERM_LINES } from "../lib/fixtures";
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
  const [lines, setLines] = useState<TermLine[]>(TERM_LINES);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [lines]);

  const runCmd = () => {
    if (!input.trim()) return;
    setLines((current) => [
      ...current.slice(0, -1),
      { kind: "prompt", cwd: "~/openclaw-api (wt/refactor-auth-flow)", cmd: input },
      { kind: "out", text: "(demo) ok" },
      { kind: "prompt", cwd: "~/openclaw-api (wt/refactor-auth-flow)", cmd: "" },
    ]);
    setInput("");
  };

  return (
    <div className={"terminal-wrap " + (placement === "bottom" ? "bottom" : "")} style={{ height: height + "px" }}>
      <div className="term-resize-top"></div>
      <div className="term-head">
        <div className="term-tabs">
          <div className="term-tab active"><Icon name="terminal" size={10} /><span>zsh - worktree</span></div>
          <div className="term-tab"><Icon name="play" size={10} /><span>vitest - watch</span></div>
        </div>
        <div className="panel-spacer"></div>
        <button className="panel-btn" onClick={onTogglePlacement} title={placement === "bottom" ? "Dock right" : "Dock bottom"}><Icon name="split" size={12} /></button>
        <button className="panel-btn" onClick={onClose} title="Close"><Icon name="x" size={12} /></button>
      </div>
      <div className="term-body" ref={bodyRef}>
        {lines.map((l, i) => {
          if (l.kind === "prompt") {
            const isLast = i === lines.length - 1 && !l.cmd;
            return (
              <div key={i} className="term-line">
                <span className="cwd">{l.cwd}</span>
                <span className="prompt">&gt;</span>
                {isLast ? <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runCmd(); }} style={{ flex: 1, color: "var(--fg-0)" }} autoFocus /> : <span>{l.cmd}</span>}
              </div>
            );
          }
          const cls = l.kind === "muted" ? "muted" : l.kind === "warn" ? "warn" : l.kind === "err" ? "err" : l.kind === "ok" ? "" : "";
          return <div key={i} className="term-line"><span className={l.kind === "ok" ? "" : cls}>{l.text || "\u00A0"}</span></div>;
        })}
      </div>
    </div>
  );
}
