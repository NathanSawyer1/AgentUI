import type { OptionItem } from "../lib/types";

// ---------------------------------------------------------------------------
// Option dropdown constants
// ---------------------------------------------------------------------------

export const PERMISSION_MODES: OptionItem[] = [
  { id: "default", name: "Default", meta: "mode", desc: "Standard permission prompting", active: true },
  { id: "plan", name: "Plan", meta: "mode", desc: "Read-only planning mode, no file writes" },
  { id: "yolo", name: "Yolo", meta: "mode", desc: "Skip all permission prompts" },
];

export const DEFAULT_MODELS: OptionItem[] = [
  { id: "", name: "Default", meta: "openclaw", desc: "Use the active OpenClaw session model.", active: true },
];

export const DEFAULT_AGENTS: OptionItem[] = [
  { id: "main", name: "main", meta: "default", desc: "Primary OpenClaw agent", active: true },
];

export const THINKING_LEVELS: OptionItem[] = [
  { id: "off", name: "off", meta: "thinking", desc: "No extended thinking", active: true },
  { id: "minimal", name: "minimal", meta: "thinking", desc: "" },
  { id: "low", name: "low", meta: "thinking", desc: "" },
  { id: "medium", name: "medium", meta: "thinking", desc: "" },
  { id: "high", name: "high", meta: "thinking", desc: "" },
  { id: "xhigh", name: "xhigh", meta: "thinking", desc: "" },
  { id: "adaptive", name: "adaptive", meta: "thinking", desc: "Model decides" },
  { id: "max", name: "max", meta: "thinking", desc: "" },
];
