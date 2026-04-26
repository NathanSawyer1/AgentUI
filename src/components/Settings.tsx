import { useEffect, useState } from "react";
import type { AppSettings } from "../lib/types";
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

  useEffect(() => setPath(settings.openclawPath), [settings.openclawPath]);

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
                <div className="setting">
                  <div className="setting-label">Binary path</div>
                  <input className="font-select" value={path} placeholder="Use PATH lookup: openclaw" onChange={(e) => setPath(e.target.value)} onBlur={() => onChange({ openclawPath: path })} />
                </div>
                <label className="setting check-row"><input type="checkbox" checked={settings.useMock} onChange={(e) => onChange({ useMock: e.target.checked })} /> Use mock adapter</label>
              </>
            )}
            {tab === "general" && <div style={{ color: "var(--fg-3)" }}>Worktree defaults and notifications are not part of this iteration.</div>}
            {tab === "about" && <div style={{ color: "var(--fg-3)" }}>AgentUI v0.1.0 - Tauri shell for openclaw.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
