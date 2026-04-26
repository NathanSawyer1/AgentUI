import { useRef, useState } from "react";
import { MODELS, PERMS } from "../lib/fixtures";
import { chatSend } from "../lib/openclaw";
import type { OptionItem } from "../lib/types";
import { Icon } from "./Icons";

function Dropdown({ open, onClose, children, align = "left" }: { open: boolean; onClose: () => void; children: React.ReactNode; align?: "left" | "right" }) {
  const ref = useRef<HTMLDivElement | null>(null);
  if (!open) return null;
  return <div className={"dd-menu " + align} ref={ref}>{children}</div>;
}

function OptionMenu({ title, items, value, onChange, onClose }: { title: string; items: OptionItem[]; value: string; onChange: (id: string) => void; onClose: () => void }) {
  return (
    <>
      <div className="dd-head">{title}</div>
      {items.map((it) => (
        <div key={it.id} className={"dd-item" + (value === it.id ? " active" : "")} onClick={() => { onChange(it.id); onClose(); }}>
          <span className="check">{value === it.id ? <Icon name="check" size={10} /> : null}</span>
          <div className="text">
            <div>{it.name}</div>
            {it.desc && <div className="desc">{it.desc}</div>}
          </div>
          <span className="meta">{it.meta}</span>
        </div>
      ))}
    </>
  );
}

export function Composer({ sessionId, onUserMessage, onError }: { sessionId: string; onUserMessage: (text: string) => void; onError: (message: string) => void }) {
  const [text, setText] = useState("");
  const [model, setModel] = useState("sonnet");
  const [perm, setPerm] = useState("edit");
  const [openDd, setOpenDd] = useState<"model" | "perm" | null>(null);
  const [attached, setAttached] = useState<Array<{ name: string; size: number }>>([]);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const modelItem = MODELS.find((m) => m.id === model) ?? MODELS[0];
  const permItem = PERMS.find((p) => p.id === perm) ?? PERMS[0];

  const handleSend = async () => {
    const outgoing = text.trim();
    if (!outgoing) return;
    setText("");
    setAttached([]);
    if (textRef.current) textRef.current.style.height = "auto";
    onUserMessage(outgoing);
    try {
      await chatSend(sessionId, outgoing);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  };

  const resize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = Math.min(160, el.scrollHeight) + "px";
  };

  return (
    <div className="composer-wrap">
      <div className="composer-inner">
        <div className="suggestions">
          <div className="suggestion">Run the test suite</div>
          <div className="suggestion">Open a PR with these changes</div>
          <div className="suggestion">Explain the token bucket</div>
        </div>
        <div className="composer">
          {attached.length > 0 && (
            <div className="attachments">
              {attached.map((f, i) => (
                <div key={i} className="att">
                  <Icon name="file" size={10} />
                  {f.name}
                  <span className="x" onClick={() => setAttached((a) => a.filter((_, j) => j !== i))}><Icon name="x" size={10} /></span>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={textRef}
            className="composer-text"
            placeholder="Your message here..."
            value={text}
            rows={1}
            onChange={(e) => { setText(e.target.value); resize(e.target); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <div className="composer-bar">
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => {
              const files = Array.from(e.target.files ?? []).map((f) => ({ name: f.name, size: f.size }));
              setAttached((a) => [...a, ...files]);
              e.currentTarget.value = "";
            }} />
            <button className="cb-btn plus" title="Attach files or screenshots" onClick={() => fileRef.current?.click()}><Icon name="plus" size={14} /></button>
            <div className="dd-wrap">
              <button className="cb-btn" onClick={() => setOpenDd(openDd === "perm" ? null : "perm")}><Icon name="check" size={11} />{permItem.name}<Icon name="chevDown" size={10} /></button>
              <Dropdown open={openDd === "perm"} onClose={() => setOpenDd(null)} align="left">
                <OptionMenu title="Permissions" items={PERMS} value={perm} onChange={setPerm} onClose={() => setOpenDd(null)} />
              </Dropdown>
            </div>
            <div className="cb-spacer"></div>
            <div className="dd-wrap">
              <button className="cb-btn" onClick={() => setOpenDd(openDd === "model" ? null : "model")}><Icon name="cpu" size={11} />{modelItem.name}<Icon name="chevDown" size={10} /></button>
              <Dropdown open={openDd === "model"} onClose={() => setOpenDd(null)} align="right">
                <OptionMenu title="Model" items={MODELS} value={model} onChange={setModel} onClose={() => setOpenDd(null)} />
              </Dropdown>
            </div>
            <button className="cb-send" disabled={!text.trim()} onClick={() => void handleSend()}><Icon name="arrowUp" size={14} stroke={2} /></button>
          </div>
        </div>
        <div className="meta-row">
          <div className="left">
            <span className="kv"><Icon name="folder" size={10} /> <span className="v">openclaw-api</span></span>
            <span className="kv"><Icon name="gitBranch" size={10} /> <span className="v">wt/refactor-auth-flow</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
