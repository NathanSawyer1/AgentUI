import { useState } from "react";
import { DIFF_FILES, DIFF_ROWS } from "../lib/fixtures";
import { Icon } from "../components/Icons";

export function DiffViewer({ onClose }: { onClose: () => void }) {
  const [activeFile, setActiveFile] = useState(DIFF_FILES[0].path);
  const active = DIFF_FILES.find((f) => f.path === activeFile) ?? DIFF_FILES[0];

  return (
    <div className="diff">
      <div className="panel-head">
        <div className="panel-title"><Icon name="diff" size={12} /> Diff Viewer</div>
        <div className="panel-spacer"></div>
        <button className="panel-btn" title="Copy patch"><Icon name="code" size={12} /></button>
        <button className="panel-btn" onClick={onClose} title="Close"><Icon name="x" size={12} /></button>
      </div>
      <div className="diff-tabs">
        {DIFF_FILES.map((f) => (
          <div key={f.path} className={"diff-tab" + (activeFile === f.path ? " active" : "")} onClick={() => setActiveFile(f.path)}>
            <Icon name="file" size={10} />
            <span>{f.path.split("/").pop()}</span>
            <span className="badge">+{f.adds} -{f.dels}</span>
          </div>
        ))}
      </div>
      <div className="diff-file" title={activeFile}>
        <Icon name="folder" size={10} />
        <span className="path">{activeFile}</span>
        <span className="adds">+{active.adds}</span>
        <span className="dels">-{active.dels}</span>
      </div>
      <div className="diff-view">
        <div className="diff-side">
          <div className="diff-side-head"><span className="dot-old"></span> before - main</div>
          {DIFF_ROWS.map((row, i) => {
            if ("type" in row) return <div key={i} className="diff-row hunk"><div className="code">{row.label}</div></div>;
            const cls = row.old.kind === "del" ? "del" : row.old.kind === "add" ? "add" : "";
            return <div key={i} className={"diff-row " + cls}><div className="ln">{row.old.ln}</div><div className="code">{row.old.code}</div></div>;
          })}
        </div>
        <div className="diff-side">
          <div className="diff-side-head"><span className="dot-new"></span> after - working</div>
          {DIFF_ROWS.map((row, i) => {
            if ("type" in row) return <div key={i} className="diff-row hunk"><div className="code">{row.label}</div></div>;
            const cls = row.nw.kind === "add" ? "add" : row.nw.kind === "del" ? "del" : "";
            return <div key={i} className={"diff-row " + cls}><div className="ln">{row.nw.ln}</div><div className="code">{row.nw.code}</div></div>;
          })}
        </div>
      </div>
    </div>
  );
}
