import type { SlashCommand } from "../lib/types";

// ---------------------------------------------------------------------------
// Slash command matching / filtering
// ---------------------------------------------------------------------------

export const CATEGORY_ORDER = ["status", "session", "options", "tools/skills", "management", "media", "docks"];

export function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    status: "Status",
    session: "Session",
    options: "Options",
    "tools/skills": "Tools & Skills",
    management: "Management",
    media: "Media",
    docks: "Docks",
  };
  return labels[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1);
}

export function filterSlashCommands(commands: SlashCommand[], filter: string): SlashCommand[] {
  const q = filter.toLowerCase();
  const score = (c: SlashCommand): number => {
    if (!q) return 1;
    if (c.textAliases.some((a) => a.slice(1).toLowerCase().startsWith(q))) return 3;
    if (c.name.toLowerCase().includes(q)) return 2;
    return (c.description ?? "").toLowerCase().includes(q) ? 1 : 0;
  };
  return commands
    .map((c) => ({ c, s: score(c) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
}

export function slashFilterMatch(input: string): { filter: string; slashOpen: boolean } | null {
  const firstLine = input.split("\n", 1)[0];
  const m = /^\s*\/([\w-]*)$/.exec(firstLine);
  if (m) {
    return { filter: m[1], slashOpen: true };
  }
  return null;
}

export function nextArgIndex(command: SlashCommand, after: number): number {
  return (command.args ?? []).findIndex((a, i) => i > after && (a.choices?.length ?? 0) > 0);
}

export function commandAlias(command: SlashCommand): string {
  return command.textAliases[0];
}

export function shouldKeepArgPicker(input: string, argPicker: { command: SlashCommand; argIndex: number } | null): boolean {
  if (!argPicker) return false;
  const alias = commandAlias(argPicker.command);
  return input.trimStart().startsWith(alias);
}
