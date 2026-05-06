import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_SETTINGS, MODELS, MOCK_SLASH_COMMANDS, mockGatewayStatus, SESSIONS } from "./fixtures";
import type { AgentCapabilities, AppSettings, ChatEvent, ChatSendOptions, DiffFile, DiffPatch, DoctorReport, GatewayStatus, HistoryMessage, LogsEvent, OptionItem, PluginActionResult, PluginItem, PluginSearchResult, RunId, SessionInfo, SkillItem, SlashCommand, TerminalEvent, WorkspaceStatus } from "./types";

const inTauri = () => "__TAURI_INTERNALS__" in window;

export async function gatewayStatus(): Promise<GatewayStatus> {
  if (!inTauri()) return mockGatewayStatus();
  return invoke<GatewayStatus>("gateway_status");
}

export async function doctorStatus(): Promise<DoctorReport> {
  if (!inTauri()) {
    return {
      appVersion: "0.1.0",
      mode: "mock",
      binaryPath: undefined,
      tokenPresent: false,
      checks: [
        { id: "mode", label: "Adapter mode", status: "ok", detail: "Mock adapter is enabled" },
        { id: "binary", label: "OpenClaw binary", status: "warn", detail: "Binary not checked outside Tauri" },
        { id: "token", label: "Gateway token", status: "warn", detail: "OPENCLAW_GATEWAY_TOKEN is not set" },
        { id: "gateway", label: "Gateway status", status: "ok", detail: "Mock gateway is online" },
      ],
    };
  }
  return invoke<DoctorReport>("doctor_status");
}

export async function workspaceStatus(): Promise<WorkspaceStatus> {
  if (!inTauri()) {
    return {
      cwd: "~/AgentUI",
      repo: "AgentUI",
      gitBranch: "main",
      gitWorktree: "AgentUI",
      gitChanges: 0,
      gitHead: "mock",
    };
  }
  return invoke<WorkspaceStatus>("workspace_status");
}

export async function chatSend(sessionId: string, text: string, options: ChatSendOptions = {}): Promise<void> {
  if (!inTauri()) return;
  return invoke("chat_send", { sessionId, text, options });
}

export async function chatCancel(sessionId: string): Promise<void> {
  if (!inTauri()) return;
  return invoke("chat_cancel", { sessionId });
}

export async function agentCapabilities(): Promise<AgentCapabilities> {
  if (!inTauri()) return { permissionFlags: false, archiveSession: false };
  return invoke<AgentCapabilities>("agent_capabilities");
}

export async function modelsList(): Promise<OptionItem[]> {
  if (!inTauri()) return MODELS;
  return invoke<OptionItem[]>("models_list");
}

export async function agentsList(): Promise<OptionItem[]> {
  if (!inTauri()) {
    return [
      { id: "main", name: "main", meta: "default", desc: "Primary OpenClaw agent", active: true },
      { id: "coder", name: "coder", meta: "agent", desc: "Coding specialist" },
    ];
  }
  return invoke<OptionItem[]>("agents_list");
}

export async function skillsList(): Promise<SkillItem[]> {
  if (!inTauri()) {
    return [
      {
        name: "spawn",
        description: "Ephemeral subagent spawning for coder, reviewer, explore, mini, or research-lite.",
        eligible: true,
        disabled: false,
        modelVisible: true,
        userInvocable: true,
        commandVisible: false,
        source: "workspace",
        bundled: false,
        missing: { bins: [], anyBins: [], env: [], config: [], os: [] },
      },
      {
        name: "blogwatcher",
        description: "Monitor blogs and RSS/Atom feeds for updates using the blogwatcher CLI.",
        eligible: false,
        disabled: false,
        modelVisible: false,
        userInvocable: true,
        commandVisible: false,
        source: "openclaw-bundled",
        bundled: true,
        homepage: "https://github.com/Hyaxia/blogwatcher",
        missing: { bins: ["blogwatcher"], anyBins: [], env: [], config: [], os: [] },
      },
      {
        name: "weather",
        description: "Get current weather, rain, temperature, and forecasts for locations or travel planning.",
        eligible: true,
        disabled: false,
        modelVisible: true,
        userInvocable: true,
        commandVisible: false,
        source: "openclaw-bundled",
        bundled: true,
        missing: { bins: [], anyBins: [], env: [], config: [], os: [] },
      },
    ];
  }
  return invoke<SkillItem[]>("skills_list");
}

export async function skillSetEnabled(name: string, enabled: boolean): Promise<SkillItem[] | undefined> {
  if (!inTauri()) return undefined;
  return invoke<SkillItem[]>("skill_set_enabled", { name, enabled });
}

const MOCK_PLUGINS: PluginItem[] = [
  {
    id: "codex",
    name: "Codex",
    version: "2026.5.2",
    description: "Codex app-server harness and managed GPT model catalog.",
    origin: "global",
    source: "~/.openclaw/npm/node_modules/@openclaw/codex",
    enabled: true,
    status: "loaded",
    providerIds: ["codex"],
    mediaUnderstandingProviderIds: ["codex"],
    migrationProviderIds: ["codex"],
    commands: ["codex"],
    dependencyStatus: { hasDependencies: true, installed: true, requiredInstalled: true, optionalInstalled: true, missing: [], missingOptional: [] },
  },
  {
    id: "webhooks",
    name: "Webhooks",
    version: "2026.5.2",
    description: "Authenticated inbound webhooks bound to OpenClaw TaskFlows.",
    origin: "bundled",
    enabled: false,
    status: "disabled",
    services: ["webhooks"],
    httpRoutes: 2,
    dependencyStatus: { hasDependencies: true, installed: true, requiredInstalled: true, optionalInstalled: true, missing: [], missingOptional: [] },
  },
  {
    id: "local-tools",
    name: "Local Tools",
    version: "0.4.0",
    description: "Workspace commands and gateway hooks for local automation.",
    origin: "config",
    enabled: true,
    status: "loaded",
    toolNames: ["repo_status", "run_task"],
    hookNames: ["session.start"],
    cliCommands: ["tools"],
    dependencyStatus: { hasDependencies: true, installed: false, requiredInstalled: false, optionalInstalled: true, missing: ["zx"], missingOptional: [] },
  },
];

export async function pluginsList(): Promise<PluginItem[]> {
  if (!inTauri()) return MOCK_PLUGINS;
  return invoke<PluginItem[]>("plugins_list");
}

export async function pluginSetEnabled(id: string, enabled: boolean): Promise<PluginItem[]> {
  if (!inTauri()) return MOCK_PLUGINS.map((plugin) => plugin.id === id ? { ...plugin, enabled, status: enabled ? "loaded" : "disabled" } : plugin);
  return invoke<PluginItem[]>("plugin_set_enabled", { id, enabled });
}

export async function pluginsSearch(query: string, limit = 8): Promise<PluginSearchResult[]> {
  if (!inTauri()) {
    const needle = query.trim().toLowerCase();
    return [
      { id: "github", name: "GitHub", version: "1.2.0", description: "Repository, issue, and pull request tools.", spec: "clawhub:github", author: "OpenClaw" },
      { id: "slack", name: "Slack", version: "0.8.1", description: "Channel notifications and message workflows.", spec: "clawhub:slack", author: "OpenClaw" },
      { id: "linear", name: "Linear", version: "0.5.3", description: "Issue triage and project updates.", spec: "clawhub:linear", author: "OpenClaw" },
    ].filter((item) => !needle || [item.id, item.name, item.description].join(" ").toLowerCase().includes(needle)).slice(0, limit);
  }
  return invoke<PluginSearchResult[]>("plugins_search", { query, limit });
}

export async function pluginInstall(spec: string): Promise<PluginActionResult> {
  if (!inTauri()) return { output: `Installed ${spec}` };
  return invoke<PluginActionResult>("plugin_install", { spec });
}

export async function pluginUpdate(id?: string): Promise<PluginActionResult> {
  if (!inTauri()) return { output: id ? `Updated ${id}` : "Updated all plugins" };
  return invoke<PluginActionResult>("plugin_update", { id });
}

export async function pluginUninstallPreview(id: string): Promise<PluginActionResult> {
  if (!inTauri()) return { output: `Dry run: ${id} would be removed from the plugin registry. No files changed.` };
  return invoke<PluginActionResult>("plugin_uninstall_preview", { id });
}

export async function pluginUninstall(id: string): Promise<PluginActionResult> {
  if (!inTauri()) return { output: `Uninstalled ${id}` };
  return invoke<PluginActionResult>("plugin_uninstall", { id });
}

export async function sessionsList(): Promise<SessionInfo[]> {
  if (!inTauri()) return SESSIONS;
  return invoke<SessionInfo[]>("sessions_list");
}

export async function sessionCreate(agentId?: string): Promise<SessionInfo> {
  if (!inTauri()) {
    const id = `agent:${agentId || "main"}:mock-${Date.now()}`;
    return { id, name: id, status: "idle", time: "new", active: true, ageMs: 0 };
  }
  return invoke<SessionInfo>("session_create", { agentId });
}

export async function diffFiles(): Promise<DiffFile[]> {
  if (!inTauri()) return [];
  return invoke<DiffFile[]>("diff_files");
}

export async function diffPatch(path: string): Promise<DiffPatch> {
  if (!inTauri()) return { path, patch: "" };
  return invoke<DiffPatch>("diff_patch", { path });
}

export async function terminalRun(command: string, cwd?: string): Promise<RunId> {
  if (!inTauri()) return { runId: `mock-term-${Date.now()}` };
  return invoke<RunId>("terminal_run", { command, cwd });
}

export async function terminalCancel(runId: string): Promise<void> {
  if (!inTauri()) return;
  return invoke("terminal_cancel", { runId });
}

export async function logsTail(limit?: number, follow?: boolean): Promise<RunId> {
  if (!inTauri()) return { runId: `mock-logs-${Date.now()}` };
  return invoke<RunId>("logs_tail", { limit, follow });
}

export async function logsStop(runId: string): Promise<void> {
  if (!inTauri()) return;
  return invoke("logs_stop", { runId });
}

export async function popoutSession(session: SessionInfo, title = session.name): Promise<void> {
  const url = `/?popout=1&sessionId=${encodeURIComponent(session.id)}`;
  if (!inTauri()) {
    window.open(url, `agentui-popout-${session.id}`);
    return;
  }
  return invoke("session_popout", { sessionId: session.id, title });
}

export async function sessionHistory(sessionId: string, limit = 1000): Promise<HistoryMessage[]> {
  if (!inTauri()) {
    return [
      { role: "user", text: "Can you load this session history?" },
      { role: "assistant", text: "Yep — this is mock history for the selected session." },
    ];
  }
  return invoke<HistoryMessage[]>("session_history", { sessionId, limit });
}

export async function slashCommandsList(): Promise<SlashCommand[]> {
  if (!inTauri()) return MOCK_SLASH_COMMANDS;
  return invoke<SlashCommand[]>("slash_commands_list");
}

export async function settingsGet(): Promise<AppSettings> {
  if (!inTauri()) return DEFAULT_SETTINGS;
  return invoke<AppSettings>("settings_get");
}

export async function settingsSet(patch: AppSettings): Promise<void> {
  if (!inTauri()) return;
  return invoke("settings_set", { patch });
}

export async function listenChat(handler: (event: ChatEvent) => void): Promise<() => void> {
  if (!inTauri()) return () => undefined;
  return listen<ChatEvent>("openclaw:chat", (event) => handler(event.payload));
}

export async function listenTerminal(handler: (event: TerminalEvent) => void): Promise<() => void> {
  if (!inTauri()) return () => undefined;
  return listen<TerminalEvent>("agentui:terminal", (event) => handler(event.payload));
}

export async function listenLogs(handler: (event: LogsEvent) => void): Promise<() => void> {
  if (!inTauri()) return () => undefined;
  return listen<LogsEvent>("agentui:logs", (event) => handler(event.payload));
}
