import { useEffect, useState } from "react";
import type { AppSettings } from "../lib/types";
import { normalizeStatusLineItems, STATUS_LINE_ITEMS } from "../lib/statusLine";
import { Icon } from "./Icons";

const ACCENTS = [
  { id: "blue", hue: 245, name: "Electric blue" },
  { id: "violet", hue: 300, name: "Violet" },
  { id: "green", hue: 150, name: "Muted green" },
  { id: "amber", hue: 70, name: "Amber" },
  { id: "pink", hue: 0, name: "Magenta" },
] as const;

const FONTS = [
  { id: "jetbrains", label: "JetBrains Mono", stack: '"JetBrains Mono", ui-monospace, monospace' },
  { id: "plex", label: "IBM Plex Mono", stack: '"IBM Plex Mono", ui-monospace, monospace' },
  { id: "inter", label: "Inter (sans)", stack: '"Inter", system-ui, sans-serif' },
] as const;

export function applySettings(s: AppSettings) {
  const accent = ACCENTS.find((a) => a.id === s.accent) || ACCENTS[0];
  const font = FONTS.find((f) => f.id === s.font) || FONTS[0];
  const root = document.documentElement;

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isLight = s.theme === "light" || (s.theme === "system" && !prefersDark);
  root.setAttribute("data-theme", isLight ? "light" : "dark");

  root.style.setProperty("--accent", `oklch(0.72 0.18 ${accent.hue})`);
  root.style.setProperty("--accent-soft", `oklch(0.72 0.18 ${accent.hue} / 0.15)`);
  root.style.setProperty("--accent-dim", `oklch(0.72 0.18 ${accent.hue} / 0.35)`);
  root.style.setProperty("--accent-fg", `oklch(0.96 0.02 ${accent.hue})`);
  root.style.setProperty("--font-mono", font.stack);
  root.style.setProperty("--size", s.fontSize + "px");
}

export function SettingsModal({ onClose, settings, onChange }: { onClose: () => void; settings: AppSettings; onChange: (patch: Partial<AppSettings>) => void }) {
  const [tab, setTab] = useState<"appearance" | "openclaw" | "general" | "about">("appearance");
  const [path, setPath] = useState(settings.openclawPath);
  const statusItems = normalizeStatusLineItems(settings.statusLineItems);

  useEffect(() => setPath(settings.openclawPath), [settings.openclawPath]);

  const changeStatusItem = (index: number, enabled: boolean) => {
    onChange({ statusLineItems: statusItems.map((item, i) => i === index ? { ...item, enabled } : item) });
  };

  const moveStatusItem = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= statusItems.length) return;
    const next = [...statusItems];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    onChange({ statusLineItems: next });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="panel-btn" onClick={onClose}><Icon name="x" size={12} /></button>
        </div>
        <div className="settings-page">
          <div className="settings-tabs">
            {(["appearance", "openclaw", "general", "about"] as const).map((name) => <div key={name} className={"stab" + (tab === name ? " active" : "")} onClick={() => setTab(name)}>{name[0].toUpperCase() + name.slice(1)}</div>)}
          </div>
          <div className="modal-body" style={{ flex: 1 }}>
            {tab === "appearance" && (
              <>
                <div className="setting">
                  <div className="setting-label">Theme</div>
                  <div className="theme-toggle">
                    {(["dark", "light", "system"] as const).map((theme) => <button key={theme} className={settings.theme === theme ? "active" : ""} onClick={() => onChange({ theme })}><Icon name={theme === "dark" ? "moon" : theme === "light" ? "sun" : "monitor"} size={12} /> {theme}</button>)}
                  </div>
                </div>
                <div className="setting">
                  <div className="setting-label">Accent color</div>
                  <div className="swatches">
                    {ACCENTS.map((a) => <div key={a.id} className={"swatch" + (settings.accent === a.id ? " active" : "")} title={a.name} style={{ background: `oklch(0.72 0.18 ${a.hue})` }} onClick={() => onChange({ accent: a.id })}></div>)}
                  </div>
                </div>
                <div className="setting">
                  <div className="setting-label">Monospace font</div>
                  <select className="font-select" value={settings.font} onChange={(e) => onChange({ font: e.target.value as AppSettings["font"] })}>{FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
                </div>
                <div className="setting">
                  <div className="setting-label">Base font size - {settings.fontSize}px</div>
                  <div className="slider-wrap"><input type="range" min="11" max="15" step="1" value={settings.fontSize} onChange={(e) => onChange({ fontSize: +e.target.value })} /><span className="slider-val">{settings.fontSize}px</span></div>
                </div>
              </>
            )}
            {tab === "openclaw" && (
              <>
                {!settings.useMock && !settings.openclawPath.trim() && (
                  <div className="error-banner inline">
                    PATH lookup is active. If `openclaw` is not on PATH, sends will report: openclaw binary not found on PATH. Set Settings &gt; Openclaw &gt; Binary path or enable the mock adapter.
                  </div>
                )}
                <div className="setting">
                  <div className="setting-label">Binary path</div>
                  <input className="font-select" value={path} placeholder="Use PATH lookup: openclaw" onChange={(e) => setPath(e.target.value)} onBlur={() => onChange({ openclawPath: path })} />
                </div>
                <label className="setting check-row"><input type="checkbox" checked={settings.useMock} onChange={(e) => onChange({ useMock: e.target.checked })} /> Use mock adapter</label>
              </>
            )}
            {tab === "general" && (
              <>
                <label className="setting check-row"><input type="checkbox" checked={settings.statusLineEnabled} onChange={(e) => onChange({ statusLineEnabled: e.target.checked })} /> Show status line</label>
                <div className="setting">
                  <div className="setting-label">Status line items</div>
                  <div className="status-config-list">
                    {statusItems.map((item, index) => {
                      const def = STATUS_LINE_ITEMS.find((candidate) => candidate.id === item.id);
                      return (
                        <div key={item.id} className="status-config-row">
                          <label className="status-config-toggle">
                            <input type="checkbox" checked={item.enabled} onChange={(e) => changeStatusItem(index, e.target.checked)} />
                            <span>{def?.label ?? item.id}</span>
                            {def?.unavailable && <em>n/a</em>}
                          </label>
                          <div className="status-config-actions">
                            <button className="panel-btn" disabled={index === 0} onClick={() => moveStatusItem(index, -1)} title="Move up"><Icon name="chevUp" size={12} /></button>
                            <button className="panel-btn" disabled={index === statusItems.length - 1} onClick={() => moveStatusItem(index, 1)} title="Move down"><Icon name="chevDown" size={12} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="setting-hint">Context, token, and limit fields are available for layout now and show n/a until OpenClaw exposes usage data.</div>
                </div>
              </>
            )}
            {tab === "about" && <div style={{ color: "var(--fg-3)" }}>AgentUI v0.1.0 - Tauri shell for openclaw.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
