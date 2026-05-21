export interface LogLine {
  text: string;
  level?: string;
  malformed?: boolean;
}

export const INITIAL_LOG_LIMIT = 80;
export const FULL_LOG_LIMIT = 200;
export const MAX_RENDERED_LOG_LINES = 2000;

export function appendLogLines(current: LogLine[], incoming: LogLine[], cap = MAX_RENDERED_LOG_LINES): LogLine[] {
  if (incoming.length === 0) return current;
  const next = [...current];
  for (const line of incoming) {
    if (next.some((item) => item.text === line.text && item.level === line.level)) continue;
    next.push(line);
  }
  return next.slice(-cap);
}

export function mergeHydratedLogs(current: LogLine[], hydrated: LogLine[], cap = MAX_RENDERED_LOG_LINES): LogLine[] {
  if (hydrated.length === 0) return current.slice(-cap);
  const overlapMax = Math.min(current.length, hydrated.length);
  let overlap = 0;
  for (let size = overlapMax; size > 0; size -= 1) {
    const currentTail = current.slice(current.length - size);
    const hydratedHead = hydrated.slice(0, size);
    if (sameLines(currentTail, hydratedHead)) {
      overlap = size;
      break;
    }
  }
  return [...current, ...hydrated.slice(overlap)].slice(-cap);
}

export type LogLevelFilter = "all" | "error" | "warn" | "info" | "debug" | "malformed";
export const LOG_LEVEL_FILTERS: LogLevelFilter[] = ["all", "error", "warn", "info", "debug", "malformed"];

export function normalizeLogLevel(level?: string): string {
  const text = (level || "").trim().toLowerCase();
  if (["error", "err", "fatal"].includes(text)) return "error";
  if (["warn", "warning"].includes(text)) return "warn";
  if (["info", "notice"].includes(text)) return "info";
  if (["debug", "trace"].includes(text)) return "debug";
  return text;
}

export function logLineFromEventLine(text: string, level?: string, recordPresent = true): LogLine {
  const trimmed = text.trim();
  const malformed = !recordPresent && (trimmed.startsWith("{") || trimmed.startsWith("["));
  return { text, level: malformed ? "malformed" : normalizeLogLevel(level), malformed };
}

export function filterLogs(lines: LogLine[], query: string, level: LogLevelFilter = "all"): LogLine[] {
  const needle = query.trim().toLowerCase();
  if (!needle && level === "all") return lines;
  return lines.filter((line) => {
    if (level !== "all") {
      if (level === "malformed" && !line.malformed) return false;
      if (level !== "malformed" && normalizeLogLevel(line.level) !== level) return false;
    }
    return !needle || line.text.toLowerCase().includes(needle);
  });
}

export function visibleLogText(lines: LogLine[]): string {
  return lines.map((line) => line.text).join("\n");
}

export function logExportFilename(now = new Date()): string {
  return `agentui-logs-${now.toISOString().replace(/[:.]/g, "-")}.log`;
}

export function logFilterSummary(total: number, visible: number, query: string, level: LogLevelFilter): string {
  const filtered = query.trim() || level !== "all";
  if (!filtered) return `${total} ${total === 1 ? "line" : "lines"}`;
  return `${visible} of ${total} visible`;
}

export function shouldStickToBottom(scrollTop: number, clientHeight: number, scrollHeight: number): boolean {
  return scrollHeight - (scrollTop + clientHeight) < 24;
}

export function preservedLogScrollTop(previousTop: number, previousHeight: number, nextHeight: number, wasFollowing: boolean): number | undefined {
  if (wasFollowing) return undefined;
  return previousTop + Math.max(0, nextHeight - previousHeight);
}

function sameLines(left: LogLine[], right: LogLine[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((line, index) => line.text === right[index].text && line.level === right[index].level);
}
