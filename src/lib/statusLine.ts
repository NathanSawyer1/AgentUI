import type { StatusLineItemId, StatusLineItemSetting } from "./types";

export const STATUS_LINE_SHORT_LABELS: Record<StatusLineItemId, string> = {
  session: "session",
  sessionId: "id",
  split: "split",
  gateway: "gw",
  latency: "lat",
  time: "time",
  mock: "mode",
  cwd: "cwd",
  repo: "repo",
  gitBranch: "branch",
  gitWorktree: "tree",
  gitChanges: "git",
  gitHead: "head",
  contextWindow: "ctx",
  tokensInput: "in",
  tokensOutput: "out",
  tokensTotal: "tok",
  fiveHourLimit: "5h",
  weeklyLimit: "week",
};

export interface StatusLineItemDefinition {
  id: StatusLineItemId;
  label: string;
  unavailable?: boolean;
}

export const STATUS_LINE_ITEMS: StatusLineItemDefinition[] = [
  { id: "session", label: "Session" },
  { id: "gateway", label: "Gateway" },
  { id: "latency", label: "Latency" },
  { id: "cwd", label: "CWD" },
  { id: "gitBranch", label: "Git branch" },
  { id: "gitChanges", label: "Git changes" },
  { id: "time", label: "Time" },
  { id: "mock", label: "Adapter" },
  { id: "repo", label: "Repo" },
  { id: "gitWorktree", label: "Worktree" },
  { id: "gitHead", label: "Git HEAD" },
  { id: "sessionId", label: "Session ID" },
  { id: "split", label: "Split session" },
  { id: "contextWindow", label: "Context window", unavailable: true },
  { id: "tokensInput", label: "Input tokens", unavailable: true },
  { id: "tokensOutput", label: "Output tokens", unavailable: true },
  { id: "tokensTotal", label: "Total tokens", unavailable: true },
  { id: "fiveHourLimit", label: "5h limit", unavailable: true },
  { id: "weeklyLimit", label: "Weekly limit", unavailable: true },
];

const DEFAULT_ENABLED: StatusLineItemId[] = ["session", "gateway", "latency", "cwd", "gitBranch", "gitChanges", "time"];

export const DEFAULT_STATUS_LINE_ITEMS: StatusLineItemSetting[] = STATUS_LINE_ITEMS.map((item) => ({
  id: item.id,
  enabled: DEFAULT_ENABLED.includes(item.id),
}));

export function normalizeStatusLineItems(items?: StatusLineItemSetting[]) {
  const known = new Set(STATUS_LINE_ITEMS.map((item) => item.id));
  const byId = new Map((items ?? []).filter((item) => known.has(item.id)).map((item) => [item.id, item.enabled]));
  const orderedIds = [...(items ?? []).map((item) => item.id).filter((id) => known.has(id))];
  for (const item of STATUS_LINE_ITEMS) {
    if (!orderedIds.includes(item.id)) orderedIds.push(item.id);
  }
  return orderedIds.map((id) => ({
    id,
    enabled: byId.has(id) ? Boolean(byId.get(id)) : DEFAULT_ENABLED.includes(id),
  }));
}
