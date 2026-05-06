# 4-Week Roadmap: Production-Ready Daily Driver

This roadmap makes AgentUI dependable for daily power use on Linux first, using the current OpenClaw CLI/API surface. The priority order is responsiveness, failure recovery, session and workspace control, diagnostics, and a repeatable release path.

Each milestone is complete only when automated checks pass and the manual smoke checklist confirms the core desktop flows.

## Constraints

- Do not require OpenClaw CLI/API changes.
- Preserve current Tauri command names and wire shapes unless a change is strictly additive and backward compatible.
- Add frontend-only state and helpers where needed for UI reliability, filtering, stale-response handling, and smoke-testable behavior.
- Keep settings persistence in the existing `SettingsStore`.
- Do not introduce disk caching for fetched runtime data. Runtime caches stay memory-only unless the data is already user preference state.
- Keep Linux as the first packaging and release target.

## Week 1: Stability and Trust

Goal: make failed background work visible, recoverable, and non-blocking across the app.

### Scope

- Harden live command failures across chat, sessions, plugins, skills, logs, diff, terminal, doctor, and gateway views.
- Add consistent non-blocking error banners, retry actions, stale-data indicators, and last-updated context where background refresh can fail.
- Improve process lifecycle handling for terminal and log subprocesses:
  - Cancellation.
  - Window close cleanup.
  - Duplicate run prevention.
  - Clear terminal/log status states.
- Expand Doctor into the primary readiness screen:
  - OpenClaw binary.
  - Gateway reachability.
  - `OPENCLAW_GATEWAY_TOKEN`.
  - Current working directory and Git state.
  - Required command availability.
  - Actionable remediation text.

### Done When

- A failed refresh never blocks the whole view when stale data can still be shown.
- Each retryable failure has a visible retry action.
- Terminal and log subprocesses are cleaned up when stopped, replaced, or closed.
- Doctor can explain whether the app is ready for mock mode and live mode.

## Week 2: Daily Session Workflow

Goal: make repeated session switching, searching, and navigation fast and predictable.

### Scope

- Add session search/filter.
- Strengthen pinned/recent organization.
- Make rename and pin persistence safer against failed writes and stale local state.
- Improve chat history hydration UX:
  - Visible loading state.
  - Refresh action.
  - Stale/error state.
  - Preserved scroll behavior across session switches.
- Add keyboard-first navigation through command palette actions for:
  - Sessions.
  - Panels.
  - Split view.
  - Terminal.
  - Logs.
  - Settings.
  - Doctor.
- Make split/popout behavior more predictable:
  - Title updates.
  - Active session clarity.
  - Clean close handling.

### Done When

- Session search and pinned/recent grouping are covered by unit tests.
- Switching sessions during history hydration does not show another session's stale response as fresh.
- Keyboard actions cover the same core workflows as the visible navigation.
- Split and popout windows clearly show their active session and clean up on close.

## Week 3: Workspace and Debugging Power

Goal: make local review, repeated commands, and logs useful during daily debugging.

### Scope

- Upgrade Diff Viewer into a worktree-focused review surface:
  - File filtering.
  - Refresh button.
  - Copy path action.
  - Copy patch action.
  - Binary file handling.
  - Renamed file handling.
  - Clear empty and error states.
- Improve Terminal for repeated local commands:
  - Current working directory display.
  - Recent commands.
  - Rerun.
  - Stop.
  - Copy output.
  - Command failure affordances.
- Improve Logs for debugging:
  - Level parsing.
  - Level filters.
  - Pause/follow clarity.
  - Export/copy visible logs.
  - Better handling of malformed JSON lines.
- Keep all new runtime caching memory-only.

### Done When

- Diff parsing handles binary and renamed files without crashing or misleading the user.
- Terminal command state is test-covered and duplicate runs are prevented.
- Logs expose malformed lines without breaking filters or follow mode.
- No new fetched runtime data is persisted to disk.

## Week 4: Release Readiness

Goal: make builds, installs, diagnostics, and user support repeatable.

### Scope

- Add a Linux-first packaging/release checklist around `tauri build`:
  - Artifact naming.
  - Install/run smoke test.
  - Clean reinstall behavior.
  - Mock/live mode validation.
- Strengthen CI to run frontend tests, Rust checks/tests, and build validation consistently with bundled/local toolchain expectations documented.
- Create user-facing troubleshooting docs for:
  - OpenClaw setup.
  - Gateway and token issues.
  - Binary path configuration.
  - Mock mode.
  - Common failure states.
- Add a concise manual smoke checklist covering:
  - Launch.
  - Doctor.
  - Chat send/cancel.
  - Session create/switch.
  - Split/popout.
  - Plugins/skills.
  - Diff.
  - Terminal.
  - Logs.
  - Settings.
  - Shutdown cleanup.

### Done When

- The release checklist has been run on Linux for mock mode and, where available, live mode.
- CI runs frontend build/tests, Rust checks/tests, and Tauri build validation.
- Troubleshooting docs cover every visible readiness failure in Doctor.
- Smoke checklist results are recorded for the release candidate.

## Test Plan

Run these checks for every milestone:

```bash
npm run check
npm run cargo:test
```

Before a release candidate, also run:

```bash
npm run tauri:build:deb
npm run tauri:build
```

Add or extend unit tests for:

- Session filtering and organization.
- Command palette actions.
- Log filtering and parsing.
- Diff file handling.
- Cache and stale-response behavior.
- Process-state helpers.

Add or extend Rust tests for:

- OpenClaw command parsing.
- Cwd validation.
- Process cleanup helpers.
- Doctor checks.
- OpenClaw output normalization.

Manual verification is tracked in [SMOKE_CHECKLIST.md](./SMOKE_CHECKLIST.md).
