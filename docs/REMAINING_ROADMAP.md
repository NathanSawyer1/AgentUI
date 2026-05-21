# Remaining Roadmap: Production-Ready Daily Driver

This is the remaining work after the reliability, diagnostics, release-docs, and packaging validation pass. The original full roadmap remains in [ROADMAP.md](./ROADMAP.md).

## Week 1 Follow-Up: Stability And Trust

Most Week 1 items are implemented. Remaining follow-up:

- Validate the new non-blocking error, retry, stale-data, and last-updated UI in live OpenClaw mode.
- Add any missing stale/error affordances discovered during manual smoke testing.
- Confirm terminal/log subprocess cleanup through an actual app-close smoke test.
- Convert any repeated one-off refresh logic that remains into the shared refresh helper when touched.

## Week 2: Daily Session Workflow

Goal: make repeated session switching, searching, and navigation fast and predictable.

### Remaining Scope

- Improve chat history hydration UX:
  - Explicit refresh action, stale/error state, and scroll preservation are implemented.
  - Validate the history refresh flow in live OpenClaw mode.
- Make rename and pin persistence safer:
  - localStorage write failures are caught and surfaced without committing optimistic state.
  - Validate browser/Tauri storage failure behavior manually.
- Strengthen keyboard-first navigation:
  - Command palette actions for recent/pinned sessions and split target selection are implemented.
  - Verify Escape/Enter/Arrow behavior across palette and modal flows.
- Polish split/popout behavior:
  - Window titles now resolve active/split session aliases and OpenClaw session names before falling back to raw IDs.
  - Split and popout pane labels, tooltips, and accessible labels now share one normalized identity helper.
  - Smoke test clean close handling for split, popout, terminal, and logs.

### Done When

- Session switch and history refresh cannot show another session's stale response as fresh.
- Rename/pin failures are visible and do not corrupt local preference state.
- Keyboard actions cover the same core workflows as visible navigation.
- Split and popout windows clearly show their active session and clean up on close.

## Week 3 Follow-Up: Workspace And Debugging Power

Several debugging upgrades are already implemented. Remaining follow-up:

- Diff Viewer:
  - Binary-file and renamed-file labels are implemented.
  - File filtering and copy-patch fallback behavior are covered by tests.
  - Verify copy path/patch in Tauri runtime, not only browser build.
- Terminal:
  - Cwd display uses workspace status and now prints the resolved workspace context in the terminal stream.
  - Recent command/rerun state helpers are extracted and covered by tests.
  - Non-zero exits and cancellations show command-specific completion summaries.
- Logs:
  - Visible logs can now be copied or exported to a timestamped `.log` file.
  - Level filter options, visible export text, export filenames, and filter summaries are covered by tests.
  - Validate malformed JSON handling against real `openclaw logs` output.
- Caching:
  - Reconfirm all new runtime caches are memory-only.
  - Keep localStorage limited to user preference state such as session aliases, pinned sessions, and settings.

### Done When

- Diff handles binary and renamed files without misleading labels.
- Terminal repeated-command workflow works in live Tauri mode.
- Logs filtering and malformed-line behavior match real OpenClaw logs.
- No fetched runtime data is persisted to disk.

## Week 4 Follow-Up: Release Readiness

Release docs and deb validation are in place. Remaining follow-up:

- Install the system `file` package permanently on Linux release hosts:

```bash
sudo apt-get update
sudo apt-get install -y file
```

- Confirm full AppImage packaging with:

```bash
OPENCLAW_MOCK=1 npm run tauri:build
```

- If AppImage runtime download remains unreliable in CI, add a documented/manual runtime download path or CI cache for the AppImage runtime.
- Add artifact checksums to release notes.
- Run install/run smoke tests for both `.deb` and `.AppImage`.
- Validate clean reinstall behavior.
- Run mock mode and live mode smoke checklists.

### Done When

- `npm run check`, `npm run cargo:test`, `npm run tauri:build:deb`, and full `npm run tauri:build` pass on the release machine.
- Generated artifacts are named, checksummed, and smoke-tested.
- Known release limitations are documented before publishing.

## Validation Commands

Run for each remaining implementation batch:

```bash
npm run check
npm run cargo:test
OPENCLAW_MOCK=1 npm run tauri:build:deb
```

Run before release:

```bash
OPENCLAW_MOCK=1 npm run tauri:build
```

Manual validation is tracked in [SMOKE_CHECKLIST.md](./SMOKE_CHECKLIST.md).
