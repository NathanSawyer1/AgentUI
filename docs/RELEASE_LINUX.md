# Linux Release Checklist

Use this checklist for Linux-first release candidates. A release is not ready until automated checks pass and the smoke checklist has been completed in mock mode and live mode where live OpenClaw is available.

## Prerequisites

- Node 20 or newer.
- Project Rust toolchain available through `.rust/`, or a compatible system Rust toolchain in CI.
- Linux Tauri dependencies installed:
  - `file`
  - `libwebkit2gtk-4.1-dev`
  - `libayatana-appindicator3-dev`
  - `librsvg2-dev`
  - `patchelf`
- OpenClaw installed for live validation.
- OpenClaw gateway running for live validation.

## Validation

Run:

```bash
npm ci
npm run check
npm run cargo:test
OPENCLAW_MOCK=1 npm run tauri:build:deb
OPENCLAW_MOCK=1 npm run tauri:build
```

Run a live build without `OPENCLAW_MOCK=1` when OpenClaw is available:

```bash
npm run tauri:build
```

CI validates the deb bundle with `npm run tauri:build:deb`. Full release validation should still run `npm run tauri:build` so AppImage packaging is covered before publishing.

## Artifact Naming

Use a consistent release label:

```text
AgentUI-<version>-linux-<arch>.<format>
```

Examples:

```text
AgentUI-0.1.0-linux-x86_64.AppImage
AgentUI-0.1.0-linux-amd64.deb
```

Keep the generated Tauri artifact path in the release notes, usually under `src-tauri/target/release/bundle/`.

## GitHub Release Workflow

Push a version tag to publish a release:

```bash
git tag v0.1.1
git push origin v0.1.1
```

Use a hyphenated tag for a pre-release:

```bash
git tag v0.1.1-alpha.1
git push origin v0.1.1-alpha.1
```

The release workflow marks hyphenated tags as GitHub pre-releases, uploads the `.deb`, AppImage, and `SHA256SUMS.txt`, and prepends the checksum block to generated release notes.

## Install And Run Smoke

For each generated Linux artifact:

- Install or run the artifact on a clean Linux user profile when possible.
- Launch AgentUI.
- Confirm the app opens without a console panic.
- Run [SMOKE_CHECKLIST.md](./SMOKE_CHECKLIST.md) in mock mode.
- Run the same checklist in live mode when OpenClaw is available.

## Clean Reinstall

- Quit AgentUI.
- Remove the installed package or AppImage launcher entry.
- Reinstall the same artifact.
- Confirm AgentUI launches again.
- Confirm settings either persist intentionally at `~/.config/com.nathan.agentui/settings.json` or can be cleared manually for a fresh profile test.

## Release Notes

Include:

- Version and commit SHA.
- Artifact names and checksums. The release workflow generates `SHA256SUMS.txt` for GitHub Releases.
- Whether mock and live smoke checks passed.
- Known limitations or capability-gated behavior.
- OpenClaw version used for live validation.
