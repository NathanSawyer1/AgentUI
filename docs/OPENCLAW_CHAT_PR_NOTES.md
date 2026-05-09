# OpenClaw Chat PR Notes

## Scope

This PR focuses on stabilizing live OpenClaw chat behavior:

- optimistic user and assistant turns
- per-turn states: `sending`, `working`, `canceling`, `failed`, `complete`
- queued sends while a turn is active
- composer focus retention after send and menu interactions
- cancel and session-switch handling
- `messageId` routing for assistant events
- activity-id based tool card merging
- JSON envelope and NDJSON/event-style OpenClaw output normalization

The branch also contains pre-existing session-pane/title work in `App.tsx`, `Session.tsx`, `sessionState.ts`, related tests, and shared CSS. Keep that work in a separate commit or call it out separately in the PR description if it is intentionally included.

## Transport Notes

- The live adapter still sends chat through `openclaw agent --session-id ... --message ... --json`.
- The adapter intentionally does not force `--verbose on`.
- TUI-equivalent streaming remains best-effort until OpenClaw exposes a stable streaming protocol. The parser now supports final JSON envelopes plus common event-style JSON records and newline-delimited JSON records.

## Validation

Run and record:

```bash
npm run check
npm run cargo:test
cargo fmt --check
```

`cargo fmt --check` is expected to fail only on the known pre-existing formatting drift in `src-tauri/src/commands.rs` and `src-tauri/src/main.rs`.

Manual live smoke should cover:

- send a message and confirm optimistic user and assistant turns appear immediately
- type and send while OpenClaw is working, then confirm the queued message flushes after `done`
- switch sessions mid-run and confirm stale events do not appear in the new session
- cancel an active turn and confirm the child process stops and the turn stays visibly failed or canceled
- trigger terminal, subagent, file, search, or network activity and expand cards to inspect input, output, error, metadata, and raw details
- run mock mode and confirm fixture activity cards still render and activity merging still behaves

## Residual Risk

Live OpenClaw payload shapes may still differ from the observed envelopes. The reducer and parser are defensive, but a stable OpenClaw streaming contract is still the main remaining risk.
