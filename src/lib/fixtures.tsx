import type { AppSettings, DiffFile, DiffRow, GatewayStatus, Message, OptionItem, SessionInfo, TermLine } from "./types";

export const DEFAULT_SETTINGS: AppSettings = {
  openclawPath: "",
  theme: "dark",
  accent: "blue",
  font: "jetbrains",
  fontSize: 12,
  useMock: false,
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

export const PERMS: OptionItem[] = [
  { id: "ask", name: "Ask every time", meta: "safe", desc: "Confirm before any file edit or command." },
  { id: "edit", name: "Edit files freely", meta: "default", desc: "Auto-approve file edits. Confirm commands.", active: true },
  { id: "shell", name: "Edit + run shell", meta: "auto", desc: "Auto-approve edits and shell commands." },
  { id: "full", name: "Full autonomy", meta: "yolo", desc: "No prompts. Use only in sandboxed worktrees." },
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
        name: "read_file",
        arg: "api/middleware/ratelimit.ts",
        status: "ok",
        preview: [
          { c: "muted", t: "// 84 lines" },
          { t: "export class TokenBucket {" },
          { t: "  take(n = 1) {" },
          { t: "    const now = Date.now()" },
          { c: "acc", t: "    this.tokens += delta * this.rate   // no clamp" },
          { t: "  }" },
          { t: "}" },
        ],
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
  { old: { ln: 8, code: <>  <span className="tk-kw">const</span> now = <span className="tk-fn">Date</span>.<span className="tk-fn">now</span>()</>, kind: "ctx" }, nw: { ln: 8, code: <>  <span className="tk-kw">const</span> now = <span className="tk-fn">Date</span>.<span className="tk-fn">now</span>()</>, kind: "ctx" } },
  { old: { ln: 9, code: <>  <span className="tk-kw">const</span> delta = (now - <span className="tk-kw">this</span>.last) / <span className="tk-nu">1000</span></>, kind: "ctx" }, nw: { ln: 9, code: <>  <span className="tk-kw">const</span> delta = (now - <span className="tk-kw">this</span>.last) / <span className="tk-nu">1000</span></>, kind: "ctx" } },
  { old: { ln: 10, code: <>  <span className="tk-kw">this</span>.tokens += delta * <span className="tk-kw">this</span>.rate</>, kind: "del" }, nw: { ln: 10, code: <>  <span className="tk-kw">this</span>.tokens = <span className="tk-fn">Math</span>.<span className="tk-fn">min</span>(<span className="tk-kw">this</span>.capacity, <span className="tk-kw">this</span>.tokens + delta * <span className="tk-kw">this</span>.rate)</>, kind: "add" } },
  { old: { ln: 11, code: <>  <span className="tk-kw">this</span>.last = now</>, kind: "ctx" }, nw: { ln: 11, code: <>  <span className="tk-kw">this</span>.last = now</>, kind: "ctx" } },
];

export const TERM_LINES: TermLine[] = [
  { kind: "info", text: "openclaw shell - worktree: wt/refactor-auth-flow - node 20.11.1" },
  { kind: "prompt", cwd: "~/openclaw-api (wt/refactor-auth-flow)", cmd: "pnpm vitest ratelimit" },
  { kind: "ok", text: "✓ api/middleware/ratelimit.test.ts (3)" },
  { kind: "muted", text: "Test Files  1 passed (1)" },
  { kind: "prompt", cwd: "~/openclaw-api (wt/refactor-auth-flow)", cmd: "" },
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
