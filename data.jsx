// Data fixtures for the demo

const SESSIONS = [
  { id: "s1", name: "refactor-auth-flow", status: "working", time: "2m", active: true },
  { id: "s2", name: "fix-race-conditions", status: "idle", time: "18m" },
  { id: "s3", name: "add-dark-mode-tokens", status: "ok", time: "1h" },
  { id: "s4", name: "db-migration-review", status: "idle", time: "3h" },
  { id: "s5", name: "openapi-spec-cleanup", status: "idle", time: "yest" },
];

const MODELS = [
  { id: "haiku", name: "Claude Haiku 4.5", meta: "fast", desc: "Fastest. Great for iteration and tool use.", active: false },
  { id: "sonnet", name: "Claude Sonnet 4.5", meta: "balanced", desc: "Balanced reasoning and speed. Default.", active: true },
  { id: "opus", name: "Claude Opus 4.1", meta: "deep", desc: "Deepest reasoning. Use for hard problems.", active: false },
  { id: "gpt5", name: "GPT-5", meta: "openai", desc: "Alternative provider via gateway.", active: false },
];

const PERMS = [
  { id: "ask", name: "Ask every time", meta: "safe", desc: "Confirm before any file edit or command.", active: false },
  { id: "edit", name: "Edit files freely", meta: "default", desc: "Auto-approve file edits. Confirm commands.", active: true },
  { id: "shell", name: "Edit + run shell", meta: "auto", desc: "Auto-approve edits and shell commands.", active: false },
  { id: "full", name: "Full autonomy", meta: "yolo", desc: "No prompts. Use only in sandboxed worktrees.", active: false },
];

const MESSAGES = [
  {
    kind: "user",
    time: "11:42",
    text: "Hey — can you look at the rate limiter in `api/middleware/ratelimit.ts`? I'm seeing it let through bursts after an idle period.",
  },
  {
    kind: "agent",
    time: "11:42",
    blocks: [
      { type: "text", content: "Sure — that sounds like the token bucket isn't clamping the refill. Let me look at the file and reproduce it." },
      {
        type: "tool",
        name: "read_file",
        arg: "api/middleware/ratelimit.ts",
        status: "ok",
        preview: [
          { c: "muted", t: "// 84 lines" },
          { t: "export class TokenBucket {" },
          { t: "  constructor(rate, capacity) {" },
          { t: "    this.rate = rate" },
          { t: "    this.capacity = capacity" },
          { t: "    this.tokens = capacity" },
          { t: "    this.last = Date.now()" },
          { t: "  }" },
          { t: "  take(n = 1) {" },
          { t: "    const now = Date.now()" },
          { t: "    const delta = (now - this.last) / 1000" },
          { c: "acc", t: "    this.tokens += delta * this.rate   // ← no clamp" },
          { t: "    this.last = now" },
          { t: "    if (this.tokens >= n) { this.tokens -= n; return true }" },
          { t: "    return false" },
          { t: "  }" },
          { t: "}" },
        ],
      },
      { type: "text", content: "Found it. On line 14 we accumulate tokens based on elapsed time but never clamp to `capacity` — so after an idle period the bucket overflows and the next request burst drains it without being throttled." },
      {
        type: "tool",
        name: "grep",
        arg: "TokenBucket  ·  api/**",
        status: "ok",
        preview: [
          { c: "muted", t: "# 3 usages" },
          { t: "api/middleware/ratelimit.ts:1" },
          { t: "api/routes/auth.ts:4   const bucket = new TokenBucket(10, 20)" },
          { t: "api/routes/upload.ts:7 const bucket = new TokenBucket(2, 5)" },
        ],
      },
      { type: "text", content: "Fix is a one-liner — clamp `tokens` to `capacity` after the refill. I'll also add a quick test that simulates an idle window." },
    ],
  },
  {
    kind: "user",
    time: "11:43",
    text: "Go for it. Make sure the test actually fails before your fix.",
  },
  {
    kind: "agent",
    time: "11:43",
    blocks: [
      { type: "text", content: "On it. Writing the failing test first, then applying the clamp." },
      {
        type: "tool",
        name: "write_file",
        arg: "api/middleware/ratelimit.test.ts",
        status: "ok",
        preview: [
          { t: "import { TokenBucket } from './ratelimit'" },
          { t: "" },
          { t: "test('does not overflow after idle', () => {" },
          { t: "  const b = new TokenBucket(10, 20)" },
          { t: "  // simulate 5s idle" },
          { t: "  b.last = Date.now() - 5000" },
          { t: "  // should only refill up to capacity" },
          { c: "add", t: "+ for (let i = 0; i < 21; i++) expect(b.take()).toBe(i < 20)" },
          { t: "})" },
        ],
      },
      {
        type: "tool",
        name: "bash",
        arg: "pnpm vitest ratelimit",
        status: "err",
        preview: [
          { c: "muted", t: "$ pnpm vitest ratelimit" },
          { t: "" },
          { t: " FAIL  api/middleware/ratelimit.test.ts" },
          { c: "del", t: "   ✗ does not overflow after idle" },
          { t: "     Expected: false" },
          { t: "     Received: true" },
          { t: "" },
          { c: "muted", t: " Tests  1 failed | 0 passed (1)" },
        ],
      },
      { type: "text", content: "Good — test fails as expected. Now applying the clamp." },
      {
        type: "tool",
        name: "edit_file",
        arg: "api/middleware/ratelimit.ts",
        status: "ok",
        preview: [
          { c: "muted", t: "@@ -10,3 +10,3 @@" },
          { c: "del", t: "-    this.tokens += delta * this.rate" },
          { c: "add", t: "+    this.tokens = Math.min(this.capacity, this.tokens + delta * this.rate)" },
        ],
      },
      { type: "thinking" },
    ],
  },
];

const DIFF_FILES = [
  { path: "api/middleware/ratelimit.ts", adds: 1, dels: 1, active: true },
  { path: "api/middleware/ratelimit.test.ts", adds: 12, dels: 0, active: false },
  { path: "api/routes/auth.ts", adds: 3, dels: 2, active: false },
];

// side-by-side diff rows for ratelimit.ts
const DIFF_ROWS = [
  { type: "hunk", label: "@@ class TokenBucket · take(n = 1) @@" },
  { old: { ln: 7, code: <><span className="tk-kw">take</span>(n = <span className="tk-nu">1</span>) {'{'}</>, kind: "ctx" },
    nw:  { ln: 7, code: <><span className="tk-kw">take</span>(n = <span className="tk-nu">1</span>) {'{'}</>, kind: "ctx" } },
  { old: { ln: 8, code: <>  <span className="tk-kw">const</span> now = <span className="tk-fn">Date</span>.<span className="tk-fn">now</span>()</>, kind: "ctx" },
    nw:  { ln: 8, code: <>  <span className="tk-kw">const</span> now = <span className="tk-fn">Date</span>.<span className="tk-fn">now</span>()</>, kind: "ctx" } },
  { old: { ln: 9, code: <>  <span className="tk-kw">const</span> delta = (now - <span className="tk-kw">this</span>.last) / <span className="tk-nu">1000</span></>, kind: "ctx" },
    nw:  { ln: 9, code: <>  <span className="tk-kw">const</span> delta = (now - <span className="tk-kw">this</span>.last) / <span className="tk-nu">1000</span></>, kind: "ctx" } },
  { old: { ln: 10, code: <>  <span className="tk-kw">this</span>.tokens += delta * <span className="tk-kw">this</span>.rate</>, kind: "del" },
    nw:  { ln: 10, code: <>  <span className="tk-kw">this</span>.tokens = <span className="tk-fn">Math</span>.<span className="tk-fn">min</span>(<span className="tk-kw">this</span>.capacity, <span className="tk-kw">this</span>.tokens + delta * <span className="tk-kw">this</span>.rate)</>, kind: "add" } },
  { old: { ln: 11, code: <>  <span className="tk-kw">this</span>.last = now</>, kind: "ctx" },
    nw:  { ln: 11, code: <>  <span className="tk-kw">this</span>.last = now</>, kind: "ctx" } },
  { old: { ln: 12, code: <>  <span className="tk-kw">if</span> (<span className="tk-kw">this</span>.tokens {'>'}= n) {'{'} <span className="tk-kw">this</span>.tokens -= n; <span className="tk-kw">return</span> <span className="tk-nu">true</span> {'}'}</>, kind: "ctx" },
    nw:  { ln: 12, code: <>  <span className="tk-kw">if</span> (<span className="tk-kw">this</span>.tokens {'>'}= n) {'{'} <span className="tk-kw">this</span>.tokens -= n; <span className="tk-kw">return</span> <span className="tk-nu">true</span> {'}'}</>, kind: "ctx" } },
  { old: { ln: 13, code: <>  <span className="tk-kw">return</span> <span className="tk-nu">false</span></>, kind: "ctx" },
    nw:  { ln: 13, code: <>  <span className="tk-kw">return</span> <span className="tk-nu">false</span></>, kind: "ctx" } },
  { old: { ln: 14, code: <>{'}'}</>, kind: "ctx" },
    nw:  { ln: 14, code: <>{'}'}</>, kind: "ctx" } },
  { type: "hunk", label: "@@ line 45 · default export @@" },
  { old: { ln: 45, code: <><span className="tk-kw">export default</span> <span className="tk-fn">createRateLimiter</span></>, kind: "ctx" },
    nw:  { ln: 45, code: <><span className="tk-kw">export default</span> <span className="tk-fn">createRateLimiter</span></>, kind: "ctx" } },
];

const TERM_LINES = [
  { kind: "info", text: "openclaw shell · worktree: wt/refactor-auth-flow · node 20.11.1" },
  { kind: "prompt", cwd: "~/openclaw-api (wt/refactor-auth-flow)", cmd: "pnpm vitest ratelimit" },
  { kind: "out", text: "" },
  { kind: "out", text: " RUN  v1.6.0  /Users/nick/openclaw-api" },
  { kind: "out", text: "" },
  { kind: "ok", text: " ✓ api/middleware/ratelimit.test.ts (3)" },
  { kind: "ok", text: "   ✓ refills at the correct rate  3ms" },
  { kind: "ok", text: "   ✓ denies when empty  1ms" },
  { kind: "ok", text: "   ✓ does not overflow after idle  2ms" },
  { kind: "out", text: "" },
  { kind: "muted", text: " Test Files  1 passed (1)" },
  { kind: "muted", text: "      Tests  3 passed (3)" },
  { kind: "muted", text: "   Duration  218ms" },
  { kind: "prompt", cwd: "~/openclaw-api (wt/refactor-auth-flow)", cmd: "git status --short" },
  { kind: "out", text: " M api/middleware/ratelimit.ts" },
  { kind: "out", text: "?? api/middleware/ratelimit.test.ts" },
  { kind: "prompt", cwd: "~/openclaw-api (wt/refactor-auth-flow)", cmd: "" },
];

window.DEMO = { SESSIONS, MODELS, PERMS, MESSAGES, DIFF_FILES, DIFF_ROWS, TERM_LINES };
