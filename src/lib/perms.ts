import type { OptionItem } from "./types";

export const PERMS: OptionItem[] = [
  { id: "ask", name: "Ask every time", meta: "local", desc: "UI-only for now. Confirmation gate will be enforced later." },
  { id: "edit", name: "Edit files freely", meta: "local", desc: "UI-only for now. No OpenClaw permission flag is sent.", active: true },
  { id: "shell", name: "Edit + run shell", meta: "local", desc: "UI-only for now. No OpenClaw permission flag is sent." },
  { id: "full", name: "Full autonomy", meta: "local", desc: "UI-only for now. Use carefully once enforcement exists." },
];
