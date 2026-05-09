# AgentUI

Tauri desktop shell for [OpenClaw](https://github.com/openclaw/openclaw).

## Requirements

- Node 20+
- Rust toolchain bundled at `.rust/` (no system Rust needed)
- `openclaw` CLI on PATH (`npm install -g openclaw`)
- OpenClaw gateway running (`openclaw gateway start`)

## Run (dev)

```bash
npm install
npm run tauri:dev
```

The `tauri:dev` script automatically prepends `.rust/cargo/bin` to PATH so the bundled Rust toolchain is used.

## Build

```bash
npm run tauri:build
```

## Project docs

- [4-week production roadmap](./docs/ROADMAP.md)
- [Linux release checklist](./docs/RELEASE_LINUX.md)
- [Troubleshooting](./docs/TROUBLESHOOTING.md)
- [Manual smoke checklist](./docs/SMOKE_CHECKLIST.md)
- [OpenClaw chat PR notes](./docs/OPENCLAW_CHAT_PR_NOTES.md)

## Env vars

| Variable | Default | Purpose |
|---|---|---|
| `OPENCLAW_MOCK=1` | off | Use the built-in mock adapter (no live openclaw needed) |
| `OPENCLAW_GATEWAY_TOKEN` | unset | Forwarded to every `openclaw` subprocess |

## Settings

Settings persist at `~/.config/com.nathan.agentui/settings.json`.

- **Binary path** — leave empty to use PATH lookup, or set an explicit path to the `openclaw` binary.
- **Use mock adapter** — same as `OPENCLAW_MOCK=1` but toggleable from the UI.
- **Theme / Accent / Font / Font size** — appearance only.
- **Status line** — toggle, enable, disable, and reorder status items for session, gateway, cwd, git state, usage placeholders, and limits.
