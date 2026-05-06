# Deferred features

Current state after the deferred feature pass.

---

## Completed

- **Plugins**: restored as a live nav view backed by OpenClaw plugin commands.
- **New Session button**: now creates a real OpenClaw session through `openclaw agent --message "" --json` without a supplied session id, then selects the returned session.
- **Diff Viewer panel**: restored as a resizable side panel backed by Git worktree diffs.
- **Terminal panel**: restored as a streamed command runner over Tauri events. It is intentionally not a full PTY.
- **Logs nav view**: added with tail, follow, pause/resume, clear, and search behavior.
- **Suggestion chips**: restored with slash-command aliases first and eligible enabled skills second.
- **Light theme**: token and component-specific polish added for dropdowns, menus, modals, terminal, diff, logs, and status surfaces.

---

## Capability-gated

### Permission preset dropdown

The dropdown remains visible but is capability-aware. OpenClaw currently exposes no supported `openclaw agent` permission or sandbox flag, so non-default modes are shown as unavailable and are not passed to the CLI.

### Archive session context-menu item

Archive is shown as unavailable until OpenClaw exposes a `sessions archive` command or equivalent API.

---

## Intentionally not reinstated

### `tauri-plugin-store`

Settings persistence remains in `SettingsStore`. It works for the current app, and migrating to `tauri-plugin-store` would not add user-facing value in this pass.
