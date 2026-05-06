# Manual Smoke Checklist

Run this checklist on Linux before marking a milestone or release candidate done. Record the mode, commit SHA, date, and OpenClaw version when live mode is used.

## Environment

- Mode: mock / live
- Commit SHA:
- OpenClaw version:
- Artifact or dev command:
- Tester:
- Date:

## Checks

- Launch: app starts without a panic or blank window.
- Doctor: readiness checks load and each failure has actionable text.
- Settings: theme, binary path, mock mode, and status-line settings can be changed and persist after restart.
- Gateway: status view loads, failed refresh is non-blocking, and retry works.
- Chat send: a message can be sent in the active session.
- Chat cancel: an in-flight response can be stopped without breaking the next send.
- History hydration: switching sessions shows a loading state and does not flash another session as fresh data.
- Session create: a new session can be created and selected.
- Session switch: switching between recent and pinned sessions preserves the active session clearly.
- Session rename/pin: rename and pin state survive refresh/restart or report a visible failure.
- Split view: split opens on the selected session, updates its title/context, and closes cleanly.
- Popout: popout opens on the selected session, updates its title/context, and closes cleanly.
- Plugins: plugins view loads, refresh/retry works, and stale data is labeled if refresh fails.
- Skills: skills view loads, refresh/retry works, and stale data is labeled if refresh fails.
- Diff: worktree changes load, file filtering works, empty/error states are clear, and copy path/patch works where available.
- Terminal: cwd is visible, command runs, rerun works, stop works, copy output works, and failures are visible.
- Logs: logs stream, pause/resume works, follow state is clear, filters work, and malformed lines do not break the view.
- Shutdown cleanup: closing the app stops terminal/log subprocesses and leaves no duplicate AgentUI child processes.

## Automated Checks

```bash
npm run check
npm run cargo:test
```

For release candidates:

```bash
npm run tauri:build:deb
npm run tauri:build
```
