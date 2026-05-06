# Troubleshooting

Start with Doctor in AgentUI. It is the readiness screen for OpenClaw binary, gateway, token, cwd/Git, command availability, and mock/live mode status.

## OpenClaw Binary Not Found

AgentUI finds OpenClaw from the configured binary path or from `PATH`.

Checks:

```bash
which openclaw
openclaw --version
```

Fixes:

- Install OpenClaw if it is missing.
- Set an explicit binary path in Settings when `openclaw` is not on `PATH`.
- Restart AgentUI after changing shell or desktop launcher environment.

## Gateway Unavailable

Live mode requires the OpenClaw gateway.

Checks:

```bash
openclaw gateway start
openclaw status
```

Fixes:

- Start or restart the gateway.
- Confirm the gateway is reachable from the same user session that launches AgentUI.
- Use mock mode when validating UI behavior without a live gateway.

## Gateway Token Issues

AgentUI forwards `OPENCLAW_GATEWAY_TOKEN` to OpenClaw subprocesses.

Checks:

```bash
printenv OPENCLAW_GATEWAY_TOKEN
openclaw status
```

Fixes:

- Export `OPENCLAW_GATEWAY_TOKEN` before launching AgentUI.
- If launching from a desktop entry, ensure the token is available to that desktop session.
- Restart AgentUI after changing the token.

## Binary Path Configuration

The Settings binary path overrides `PATH` lookup.

Fixes:

- Leave the setting empty to use `PATH`.
- Use an absolute path when the desktop environment does not inherit shell `PATH`.
- Clear the setting if Doctor reports a stale or removed binary path.

## Mock Mode

Mock mode validates AgentUI without live OpenClaw.

Use either:

```bash
OPENCLAW_MOCK=1 npm run tauri:dev
```

Or enable mock mode in Settings.

Expected behavior:

- Doctor should show mock adapter state.
- Sessions, plugins, skills, logs, diff, and chat should remain usable with fixture-backed data where supported.
- Live-only failures should be presented as warnings, not blockers.

## Common Failure States

### Stale Data

A view may keep the last successful data when a background refresh fails. Use the visible retry or refresh action. Check Doctor if retries keep failing.

### Terminal Command Fails

Confirm the displayed cwd exists and that the command works in a normal shell. Stop the current run before starting another command if a process is still active.

### Logs Stop Updating

Confirm follow mode is enabled and the log subprocess is running. Pause/resume should not discard visible lines.

### Diff Is Empty

Confirm the current cwd is a Git worktree and has uncommitted changes:

```bash
git status --short
git diff --stat
```

### Settings Do Not Persist

Settings are stored at:

```text
~/.config/com.nathan.agentui/settings.json
```

Confirm the file is writable by the current user.
