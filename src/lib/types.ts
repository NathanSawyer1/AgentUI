export type SessionStatus = "working" | "idle" | "ok" | "err";

export interface SessionInfo {
  id: string;
  name: string;
  status: SessionStatus;
  time: string;
  active?: boolean;
  ageMs?: number;
  updatedAt?: string;
}

export interface OptionItem {
  id: string;
  name: string;
  meta: string;
  desc: string;
  active?: boolean;
}

export interface ChatSendOptions {
  agentId?: string;
  model?: string;
  thinking?: "off" | "minimal" | "low" | "medium" | "high";
  permission?: string;
}

export interface PreviewLine {
  c?: "muted" | "ok" | "add" | "del" | "acc";
  t: string;
}

export interface ToolBlock {
  type: "tool";
  name: string;
  arg: string;
  status: "ok" | "err" | "running";
  preview: PreviewLine[];
}

export interface TextBlock {
  type: "text";
  content: string;
}

export interface ThinkingBlock {
  type: "thinking";
}

export type MessageBlock = TextBlock | ToolBlock | ThinkingBlock;

export interface UserMessage {
  id?: string;
  kind: "user";
  time: string;
  text: string;
}

export interface AgentMessage {
  id?: string;
  kind: "agent";
  time: string;
  blocks: MessageBlock[];
}

export type Message = UserMessage | AgentMessage;

export interface HistoryMessage {
  id?: string;
  role: "user" | "assistant";
  text: string;
  timestamp?: number;
}

export interface DiffFile {
  path: string;
  adds: number;
  dels: number;
  active?: boolean;
}

export interface DiffCell {
  ln: number;
  code: string;
  kind: "ctx" | "add" | "del";
}

export type DiffRow =
  | { type: "hunk"; label: string }
  | { old: DiffCell; nw: DiffCell };

export interface TermLine {
  kind: "info" | "prompt" | "out" | "ok" | "muted" | "warn" | "err";
  text?: string;
  cwd?: string;
  cmd?: string;
}

export interface GatewayNode {
  name: string;
  status: "online" | "degraded" | "offline";
  latency_ms: number;
  last_seen: string;
}

export interface GatewayStatus {
  status: "online" | "degraded" | "offline";
  latency_ms: number;
  checked_at: string;
  version?: string;
  nodes: GatewayNode[];
  history: number[];
  message?: string;
}

export type ChatEvent =
  | { session_id: string; type: "start"; message_id?: string }
  | { session_id: string; type: "token"; content: string; message_id?: string }
  | { session_id: string; type: "tool"; block: ToolBlock; message_id?: string }
  | { session_id: string; type: "done"; message_id?: string }
  | { session_id: string; type: "error"; error: string; message_id?: string };

export interface AppSettings {
  openclawPath: string;
  theme: "dark" | "light" | "system";
  accent: "blue" | "violet" | "green" | "amber" | "pink";
  font: "jetbrains" | "plex" | "inter";
  fontSize: number;
  useMock: boolean;
}
