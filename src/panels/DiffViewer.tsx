import { useEffect, useState } from "react";
import { activePathAfterRefresh, getDiffFilesCache, getDiffPatchCache, isPatchGenerationCurrent, markPatchLoading, nextPatchGeneration, prefetchCandidates, setDiffFilesCache, setDiffPatchCache } from "../lib/diffCache";
import { diffFiles, diffPatch } from "../lib/openclaw";
import type { DiffFile, DiffRow } from "../lib/types";
import { Icon } from "../components/Icons";

export function DiffViewer({ onClose }: { onClose: () => void }) {
  const [files, setFiles] = useState<DiffFile[]>([]);
  const [activeFile, setActiveFile] = useState("");
  const [rows, setRows] = useState<DiffRow[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingPatch, setLoadingPatch] = useState(false);
  const [error, setError] = useState("");
  const active = files.find((f) => f.path === activeFile);

  useEffect(() => {
    let cancelled = false;
    const cached = getDiffFilesCache();
    if (cached?.files.length) {
      setFiles(cached.files);
      setActiveFile((current) => activePathAfterRefresh(current, cached.files));
      setLoadingFiles(false);
    } else {
      setLoadingFiles(true);
    }
    setError("");
    void diffFiles()
      .then((items) => {
        if (cancelled) return;
        setDiffFilesCache(items);
        setFiles(items);
        setActiveFile((current) => activePathAfterRefresh(current, items));
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setLoadingFiles(false));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!activeFile) {
      setRows([]);
      return;
    }
    const cached = getDiffPatchCache(activeFile);
    if (cached) {
      setRows(cached.rows);
      setLoadingPatch(false);
    } else {
      setLoadingPatch(true);
    }
    let cancelled = false;
    const generation = nextPatchGeneration(activeFile);
    markPatchLoading(activeFile, generation);
    setError("");
    void diffPatch(activeFile)
      .then((patch) => {
        if (cancelled || !isPatchGenerationCurrent(activeFile, generation)) return;
        const record = setDiffPatchCache(activeFile, patch.patch, generation);
        setRows(record.rows);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setLoadingPatch(false));
    return () => { cancelled = true; };
  }, [activeFile]);

  useEffect(() => {
    if (!activeFile || loadingPatch) return;
    const candidates = prefetchCandidates(files, activeFile);
    for (const file of candidates) {
      const generation = nextPatchGeneration(file.path);
      markPatchLoading(file.path, generation);
      void diffPatch(file.path)
        .then((patch) => {
          if (isPatchGenerationCurrent(file.path, generation)) setDiffPatchCache(file.path, patch.patch, generation);
        })
        .catch(() => undefined);
    }
  }, [activeFile, files, loadingPatch]);

  return (
    <div className="diff">
      <div className="panel-head">
        <div className="panel-title"><Icon name="diff" size={12} /> Diff Viewer</div>
        <div className="panel-spacer"></div>
        <button className="panel-btn" onClick={onClose} title="Close"><Icon name="x" size={12} /></button>
      </div>
      {loadingFiles ? (
        <div className="panel-empty"><Icon name="spinner" size={14} /> Loading worktree diff...</div>
      ) : error ? (
        <div className="panel-empty error"><Icon name="x" size={14} /> {error}</div>
      ) : files.length === 0 ? (
        <div className="panel-empty"><Icon name="check" size={14} /> No worktree changes.</div>
      ) : (
        <>
          <div className="diff-tabs">
            {files.map((f) => (
              <button key={f.path} className={"diff-tab" + (activeFile === f.path ? " active" : "")} onClick={() => setActiveFile(f.path)}>
                <Icon name="file" size={10} />
                <span>{f.path.split("/").pop()}</span>
                <span className="badge">+{f.adds} -{f.dels}</span>
              </button>
            ))}
          </div>
          <div className="diff-file" title={activeFile}>
            <Icon name="folder" size={10} />
            <span className="path">{activeFile}</span>
            {active && <><span className="adds">+{active.adds}</span><span className="dels">-{active.dels}</span></>}
          </div>
          {loadingPatch && rows.length === 0 ? <div className="panel-empty"><Icon name="spinner" size={14} /> Loading patch...</div> : <SplitDiff rows={rows} />}
        </>
      )}
    </div>
  );
}

function SplitDiff({ rows }: { rows: DiffRow[] }) {
  if (rows.length === 0) return <div className="panel-empty">No patch for this file.</div>;
  return (
    <div className="diff-view">
      <div className="diff-side">
        <div className="diff-side-head"><span className="dot-old"></span> before - HEAD</div>
        {rows.map((row, i) => {
          if ("type" in row) return <div key={i} className="diff-row hunk"><div className="code">{row.label}</div></div>;
          const cls = row.old.ln === 0 ? "empty" : row.old.kind === "del" ? "del" : "";
          return <div key={i} className={"diff-row " + cls}><div className="ln">{row.old.ln || ""}</div><div className="code">{row.old.code}</div></div>;
        })}
      </div>
      <div className="diff-side">
        <div className="diff-side-head"><span className="dot-new"></span> after - working</div>
        {rows.map((row, i) => {
          if ("type" in row) return <div key={i} className="diff-row hunk"><div className="code">{row.label}</div></div>;
          const cls = row.nw.ln === 0 ? "empty" : row.nw.kind === "add" ? "add" : "";
          return <div key={i} className={"diff-row " + cls}><div className="ln">{row.nw.ln || ""}</div><div className="code">{row.nw.code}</div></div>;
        })}
      </div>
    </div>
  );
}
