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

export interface SkillMissing {
  bins: string[];
  anyBins: string[];
  env: string[];
  config: string[];
  os: string[];
}

export interface SkillItem {
  name: string;
  description?: string;
  emoji?: string;
  eligible: boolean;
  disabled: boolean;
  modelVisible: boolean;
  userInvocable: boolean;
  commandVisible: boolean;
  source?: string;
  bundled?: boolean;
  homepage?: string;
  missing?: SkillMissing;
}

export interface PluginDependencyStatus {
  hasDependencies?: boolean;
  installed?: boolean;
  requiredInstalled?: boolean;
  optionalInstalled?: boolean;
  missing?: string[];
  missingOptional?: string[];
  dependencies?: JsonValue[];
  optionalDependencies?: JsonValue[];
}

export interface PluginItem {
  id: string;
  name?: string;
  version?: string;
  description?: string;
  format?: string;
  source?: string;
  rootDir?: string;
  origin?: string;
  enabled: boolean;
  status?: string;
  toolNames?: string[];
  hookNames?: string[];
  channelIds?: string[];
  cliBackendIds?: string[];
  providerIds?: string[];
  speechProviderIds?: string[];
  realtimeTranscriptionProviderIds?: string[];
  realtimeVoiceProviderIds?: string[];
  mediaUnderstandingProviderIds?: string[];
  imageGenerationProviderIds?: string[];
  videoGenerationProviderIds?: string[];
  musicGenerationProviderIds?: string[];
  webFetchProviderIds?: string[];
  webSearchProviderIds?: string[];
  migrationProviderIds?: string[];
  memoryEmbeddingProviderIds?: string[];
  agentHarnessIds?: string[];
  gatewayMethods?: string[];
  cliCommands?: string[];
  services?: string[];
  gatewayDiscoveryServiceIds?: string[];
  commands?: string[];
  httpRoutes?: number;
  hookCount?: number;
  dependencyStatus?: PluginDependencyStatus;
  [key: string]: JsonValue | PluginDependencyStatus | undefined;
}

export interface PluginSearchResult {
  id: string;
  name?: string;
  version?: string;
  description?: string;
  spec?: string;
  source?: string;
  author?: string;
  [key: string]: JsonValue | undefined;
}

export interface PluginActionResult {
  output: string;
}

export interface ChatSendOptions {
  agentId?: string;
  model?: string;
  thinking?: "off" | "minimal" | "low" | "medium" | "high";
  permission?: string;
  messageId?: string;
}

export interface PreviewLine {
  c?: "muted" | "ok" | "add" | "del" | "acc";
  t: string;
}

export type ActivityKind = "tool" | "terminal" | "subagent" | "file" | "search" | "network" | "unknown";
export type ActivityStatus = "ok" | "err" | "running";
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface ToolBlock {
  type: "tool";
  id?: string;
  activity_id?: string;
  kind?: ActivityKind;
  title?: string;
  summary?: string;
  status: ActivityStatus;
  started_at?: string;
  updated_at?: string;
  input?: JsonValue;
  output?: JsonValue;
  error?: JsonValue;
  metadata?: Record<string, JsonValue>;
  raw?: JsonValue;
  name?: string;
  arg?: string;
  preview?: PreviewLine[];
}

export interface TextBlock {
  type: "text";
  content: string;
}

export interface ThinkingBlock {
  type: "thinking";
  status?: ChatTurnState;
  label?: string;
}

export type MessageBlock = TextBlock | ToolBlock | ThinkingBlock;
export type ChatTurnState = "sending" | "working" | "canceling" | "failed" | "complete";

export interface UserMessage {
  id?: string;
  historyKey?: string;
  kind: "user";
  time: string;
  text: string;
}

export interface AgentMessage {
  id?: string;
  historyKey?: string;
  kind: "agent";
  time: string;
  turnState?: ChatTurnState;
  blocks: MessageBlock[];
}

export type Message = UserMessage | AgentMessage;
export type ChatMessage = Message;

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
  binary?: boolean;
  oldPath?: string;
}

export interface DiffPatch {
  path: string;
  patch: string;
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

export interface RunId {
  runId: string;
}

export interface TerminalEvent {
  runId: string;
  stream?: "stdout" | "stderr";
  line?: string;
  exitCode?: number | null;
  error?: string;
  done?: boolean;
}

export interface LogsEvent {
  runId: string;
  line?: string;
  record?: JsonValue;
  error?: string;
  done?: boolean;
}

export interface AgentCapabilities {
  permissionFlags: boolean;
  archiveSession: boolean;
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

export interface DoctorCheck {
  id: string;
  label: string;
  status: "ok" | "warn" | "err";
  detail: string;
}

export interface DoctorReport {
  appVersion: string;
  mode: "mock" | "live";
  binaryPath?: string;
  tokenPresent: boolean;
  checks: DoctorCheck[];
}

export type StatusLineItemId =
  | "session"
  | "sessionId"
  | "split"
  | "gateway"
  | "latency"
  | "time"
  | "mock"
  | "cwd"
  | "repo"
  | "gitBranch"
  | "gitWorktree"
  | "gitChanges"
  | "gitHead"
  | "contextWindow"
  | "tokensInput"
  | "tokensOutput"
  | "tokensTotal"
  | "fiveHourLimit"
  | "weeklyLimit";

export interface StatusLineItemSetting {
  id: StatusLineItemId;
  enabled: boolean;
}

export interface WorkspaceStatus {
  cwd: string;
  repo?: string;
  gitBranch?: string;
  gitWorktree?: string;
  gitChanges?: number;
  gitHead?: string;
}

export type ChatEvent =
  | { session_id: string; type: "start"; message_id?: string }
  | { session_id: string; type: "token"; content: string; message_id?: string }
  | { session_id: string; type: "tool"; block: ToolBlock; message_id?: string; activity_id?: string }
  | { session_id: string; type: "done"; message_id?: string }
  | { session_id: string; type: "error"; error: string; message_id?: string };

export interface SlashCommandArgChoice { value: string; label?: string; }
export interface SlashCommandArg {
  name: string;
  description?: string;
  type?: string;
  choices?: SlashCommandArgChoice[];
}
export interface SlashCommand {
  name: string;
  nativeName?: string;
  textAliases: string[];
  description?: string;
  category?: string;
  source?: string;
  scope?: string;
  acceptsArgs: boolean;
  args?: SlashCommandArg[];
}

export interface AppSettings {
  openclawPath: string;
  theme: "dark" | "light" | "system";
  accent: "blue" | "violet" | "green" | "amber" | "pink";
  font: "jetbrains" | "plex" | "inter";
  fontSize: number;
  useMock: boolean;
  statusLineEnabled: boolean;
  statusLineTemplate: string;
  statusLineItems: StatusLineItemSetting[];
}
