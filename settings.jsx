const { useState: useStateSet } = React;

const ACCENTS = [
  { id: "blue",   hue: 245, name: "Electric blue" },
  { id: "violet", hue: 300, name: "Violet" },
  { id: "green",  hue: 150, name: "Muted green" },
  { id: "amber",  hue: 70,  name: "Amber" },
  { id: "pink",   hue: 0,   name: "Magenta" },
];

const FONTS = [
  { id: "jetbrains", label: "JetBrains Mono", stack: '"JetBrains Mono", ui-monospace, monospace' },
  { id: "plex",      label: "IBM Plex Mono",  stack: '"IBM Plex Mono", ui-monospace, monospace' },
  { id: "inter",     label: "Inter (sans)",   stack: '"Inter", system-ui, sans-serif' },
];

function SettingsModal({ onClose, settings, onChange }) {
  const [tab, setTab] = useStateSet("appearance");

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="panel-btn" onClick={onClose}><Icon name="x" size={12} /></button>
        </div>
        <div className="settings-page">
          <div className="settings-tabs">
            <div className={"stab" + (tab === "appearance" ? " active" : "")} onClick={() => setTab("appearance")}>Appearance</div>
            <div className={"stab" + (tab === "general" ? " active" : "")} onClick={() => setTab("general")}>General</div>
            <div className={"stab" + (tab === "shortcuts" ? " active" : "")} onClick={() => setTab("shortcuts")}>Shortcuts</div>
            <div className={"stab" + (tab === "about" ? " active" : "")} onClick={() => setTab("about")}>About</div>
          </div>
          <div className="modal-body" style={{ flex: 1 }}>
            {tab === "appearance" && (
              <>
                <div className="setting">
                  <div className="setting-label">Theme</div>
                  <div className="theme-toggle">
                    <button className={settings.theme === "dark" ? "active" : ""}
                            onClick={() => onChange({ theme: "dark" })}>
                      <Icon name="moon" size={12} /> Dark
                    </button>
                    <button className={settings.theme === "light" ? "active" : ""}
                            onClick={() => onChange({ theme: "light" })}>
                      <Icon name="sun" size={12} /> Light
                    </button>
                    <button className={settings.theme === "system" ? "active" : ""}
                            onClick={() => onChange({ theme: "system" })}>
                      <Icon name="monitor" size={12} /> System
                    </button>
                  </div>
                </div>

                <div className="setting">
                  <div className="setting-label">Accent color</div>
                  <div className="swatches">
                    {ACCENTS.map(a => (
                      <div key={a.id}
                           className={"swatch" + (settings.accent === a.id ? " active" : "")}
                           title={a.name}
                           style={{ background: `oklch(0.72 0.18 ${a.hue})` }}
                           onClick={() => onChange({ accent: a.id })}>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="setting">
                  <div className="setting-label">Monospace font</div>
                  <select className="font-select"
                          value={settings.font}
                          onChange={(e) => onChange({ font: e.target.value })}>
                    {FONTS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </div>

                <div className="setting">
                  <div className="setting-label">Base font size · {settings.fontSize}px</div>
                  <div className="slider-wrap">
                    <input type="range" min="11" max="15" step="1"
                           value={settings.fontSize}
                           onChange={(e) => onChange({ fontSize: +e.target.value })} />
                    <span className="slider-val">{settings.fontSize}px</span>
                  </div>
                </div>
              </>
            )}
            {tab === "general" && <div style={{ color: "var(--fg-3)" }}>Worktree defaults, autosave, notifications — to be designed.</div>}
            {tab === "shortcuts" && <div style={{ color: "var(--fg-3)" }}>⌘K · command palette  ·  ⌘⇧T · terminal  ·  ⌘⇧D · diff  ·  ⌘⇧S · split session</div>}
            {tab === "about" && <div style={{ color: "var(--fg-3)" }}>AgentUI v2026.8.11  ·  running on openclaw/core 0.42.0</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function applySettings(s) {
  const accent = ACCENTS.find(a => a.id === s.accent) || ACCENTS[0];
  const font = FONTS.find(f => f.id === s.font) || FONTS[0];
  const root = document.documentElement;
  root.style.setProperty("--accent", `oklch(0.72 0.18 ${accent.hue})`);
  root.style.setProperty("--accent-soft", `oklch(0.72 0.18 ${accent.hue} / 0.15)`);
  root.style.setProperty("--accent-dim", `oklch(0.72 0.18 ${accent.hue} / 0.35)`);
  root.style.setProperty("--accent-fg", `oklch(0.96 0.02 ${accent.hue})`);
  root.style.setProperty("--font-mono", font.stack);
  root.style.setProperty("--size", s.fontSize + "px");
}

window.SettingsModal = SettingsModal;
window.applySettings = applySettings;
