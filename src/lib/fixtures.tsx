import type { AppSettings, DiffFile, DiffRow, GatewayStatus, Message, OptionItem, SessionInfo, SlashCommand, TermLine } from "./types";
import { DEFAULT_STATUS_LINE_ITEMS } from "./statusLine";

export const DEFAULT_SETTINGS: AppSettings = {
  openclawPath: "",
  theme: "dark",
  accent: "blue",
  font: "jetbrains",
  fontSize: 12,
  useMock: false,
  statusLineEnabled: true,
  statusLineTemplate: "{session} | {gateway} {latency} | {time}",
  statusLineItems: DEFAULT_STATUS_LINE_ITEMS,
};

export const SESSIONS: SessionInfo[] = [
  { id: "s1", name: "refactor-auth-flow", status: "working", time: "2m", active: true },
  { id: "s2", name: "fix-race-conditions", status: "idle", time: "18m" },
  { id: "s3", name: "add-dark-mode-tokens", status: "ok", time: "1h" },
  { id: "s4", name: "db-migration-review", status: "idle", time: "3h" },
  { id: "s5", name: "openapi-spec-cleanup", status: "idle", time: "yest" },
];

export const MODELS: OptionItem[] = [
  { id: "haiku", name: "Claude Haiku 4.5", meta: "fast", desc: "Fastest. Great for iteration and tool use." },
  { id: "sonnet", name: "Claude Sonnet 4.5", meta: "balanced", desc: "Balanced reasoning and speed. Default.", active: true },
  { id: "opus", name: "Claude Opus 4.1", meta: "deep", desc: "Deepest reasoning. Use for hard problems." },
  { id: "gpt5", name: "GPT-5", meta: "openai", desc: "Alternative provider via gateway." },
];

export const MESSAGES: Message[] = [
  { kind: "user", time: "11:42", text: "Hey - can you look at the rate limiter in `api/middleware/ratelimit.ts`? I'm seeing it let through bursts after an idle period." },
  {
    kind: "agent",
    time: "11:42",
    blocks: [
      { type: "text", content: "Sure - that sounds like the token bucket isn't clamping the refill. Let me look at the file and reproduce it." },
      {
        type: "tool",
        kind: "terminal",
        title: "Terminal",
        summary: "pnpm vitest ratelimit",
        status: "ok",
        input: { command: "pnpm vitest ratelimit" },
        output: "✓ api/middleware/ratelimit.test.ts (3)\nTest Files  1 passed (1)",
        metadata: { cwd: "~/openclaw-api", durationMs: 1180, exitCode: 0 },
        raw: { name: "bash", command: "pnpm vitest ratelimit", status: "completed" },
        name: "bash",
        arg: "pnpm vitest ratelimit",
        preview: [
          { c: "ok", t: "✓ api/middleware/ratelimit.test.ts (3)" },
          { c: "muted", t: "Test Files  1 passed (1)" },
        ],
      },
      {
        type: "tool",
        kind: "file",
        title: "File",
        summary: "Read api/middleware/ratelimit.ts",
        status: "ok",
        input: { path: "api/middleware/ratelimit.ts" },
        output: "export class TokenBucket {\n  take(n = 1) {\n    const now = Date.now()\n    this.tokens += delta * this.rate\n  }\n}",
        metadata: { durationMs: 14 },
        raw: { name: "read_file", path: "api/middleware/ratelimit.ts", status: "ok" },
        name: "read_file",
        arg: "api/middleware/ratelimit.ts",
      },
      {
        type: "tool",
        kind: "subagent",
        title: "Subagent",
        summary: "Spawned explorer for token bucket tests",
        status: "running",
        input: { agent: "explorer", task: "Inspect existing rate limiter tests" },
        metadata: { agentId: "explorer-12", model: "gpt-5.3-codex", startedAt: "2026-04-25T23:45:00Z" },
        raw: { kind: "spawn_agent", agentId: "explorer-12", status: "running" },
        name: "spawn_agent",
        arg: "explorer",
      },
      {
        type: "tool",
        kind: "terminal",
        title: "Terminal",
        summary: "pnpm test ratelimit --watch=false",
        status: "err",
        input: { command: "pnpm test ratelimit --watch=false" },
        output: "Running focused test suite...",
        error: "Expected bucket size to stay <= capacity after idle refill.",
        metadata: { cwd: "~/openclaw-api", durationMs: 620, exitCode: 1 },
        raw: { name: "bash", status: "failed", stderr: "Expected bucket size to stay <= capacity after idle refill." },
        name: "bash",
        arg: "pnpm test ratelimit --watch=false",
      },
      { type: "text", content: "Found it. On line 14 we accumulate tokens based on elapsed time but never clamp to `capacity`." },
    ],
  },
];

export const DIFF_FILES: DiffFile[] = [
  { path: "api/middleware/ratelimit.ts", adds: 1, dels: 1, active: true },
  { path: "api/middleware/ratelimit.test.ts", adds: 12, dels: 0 },
  { path: "api/routes/auth.ts", adds: 3, dels: 2 },
];

export const DIFF_ROWS: DiffRow[] = [
  { type: "hunk", label: "@@ class TokenBucket - take(n = 1) @@" },
  { old: { ln: 8, code: "  const now = Date.now()", kind: "ctx" }, nw: { ln: 8, code: "  const now = Date.now()", kind: "ctx" } },
  { old: { ln: 9, code: "  const delta = (now - this.last) / 1000", kind: "ctx" }, nw: { ln: 9, code: "  const delta = (now - this.last) / 1000", kind: "ctx" } },
  { old: { ln: 10, code: "  this.tokens += delta * this.rate", kind: "del" }, nw: { ln: 10, code: "  this.tokens = Math.min(this.capacity, this.tokens + delta * this.rate)", kind: "add" } },
  { old: { ln: 11, code: "  this.last = now", kind: "ctx" }, nw: { ln: 11, code: "  this.last = now", kind: "ctx" } },
];

export const TERM_LINES: TermLine[] = [
  { kind: "info", text: "openclaw shell - worktree: wt/refactor-auth-flow - node 20.11.1" },
  { kind: "prompt", cwd: "~/openclaw-api (wt/refactor-auth-flow)", cmd: "pnpm vitest ratelimit" },
  { kind: "ok", text: "✓ api/middleware/ratelimit.test.ts (3)" },
  { kind: "muted", text: "Test Files  1 passed (1)" },
  { kind: "prompt", cwd: "~/openclaw-api (wt/refactor-auth-flow)", cmd: "" },
];

export const MOCK_SLASH_COMMANDS: SlashCommand[] = [
  { name: "help", textAliases: ["/help"], description: "Show available commands.", category: "status", source: "native", scope: "both", acceptsArgs: false },
  { name: "status", textAliases: ["/status"], description: "Show agent and session status.", category: "status", source: "native", scope: "both", acceptsArgs: false },
  { name: "compact", textAliases: ["/compact"], description: "Compact the conversation history with optional instructions.", category: "session", source: "native", scope: "both", acceptsArgs: true, args: [{ name: "instructions", description: "Custom compaction instructions", type: "string" }] },
  { name: "think", textAliases: ["/think"], description: "Set the thinking level for this session.", category: "options", source: "native", scope: "both", acceptsArgs: true, args: [{ name: "level", description: "Thinking depth", type: "string", choices: [{ value: "low", label: "low" }, { value: "medium", label: "medium" }, { value: "high", label: "high" }] }] },
  { name: "tools", textAliases: ["/tools"], description: "List available runtime tools.", category: "status", source: "native", scope: "both", acceptsArgs: true, args: [{ name: "mode", description: "compact or verbose", type: "string", choices: [{ value: "compact", label: "compact" }, { value: "verbose", label: "verbose" }] }] },
  { name: "model", textAliases: ["/model"], description: "Switch the active model for this session.", category: "options", source: "native", scope: "both", acceptsArgs: true, args: [{ name: "model", description: "Model identifier", type: "string", choices: [{ value: "claude-sonnet-4-6", label: "sonnet-4.6" }, { value: "claude-opus-4-7", label: "opus-4.7" }, { value: "claude-haiku-4-5", label: "haiku-4.5" }] }] },
];

export function mockGatewayStatus(): GatewayStatus {
  const history = Array.from({ length: 28 }, (_, i) => Math.round(38 + (Math.sin(i * 1.7) * 0.5 + 0.5) * 95));
  return {
    status: "online",
    latency_ms: history[history.length - 1],
    checked_at: new Date().toISOString(),
    version: "mock-0.42.0",
    history,
    nodes: [
      { name: "gateway", status: "online", latency_ms: history[27], last_seen: new Date().toISOString() },
      { name: "models", status: "online", latency_ms: 58, last_seen: new Date().toISOString() },
      { name: "tools", status: "degraded", latency_ms: 142, last_seen: new Date().toISOString() },
    ],
  };
}
