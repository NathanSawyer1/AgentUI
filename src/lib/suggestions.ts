import type { SkillItem, SlashCommand } from "./types";
import { commandAlias } from "./slashCommands";

export interface SuggestionChip {
  label: string;
  insert: string;
  source: "command" | "skill" | "mock";
}

export function buildSuggestions(commands: SlashCommand[], skills: SkillItem[], mockMode = false): SuggestionChip[] {
  const chips: SuggestionChip[] = [];
  for (const command of commands) {
    const alias = commandAlias(command);
    if (alias) chips.push({ label: alias, insert: alias + (command.acceptsArgs ? " " : ""), source: "command" });
    if (chips.length >= 5) break;
  }
  if (chips.length < 5) {
    for (const skill of skills) {
      if (skill.disabled || !skill.eligible || !skill.userInvocable) continue;
      chips.push({ label: `$${skill.name}`, insert: `$${skill.name} `, source: "skill" });
      if (chips.length >= 5) break;
    }
  }
  if (chips.length === 0 && mockMode) {
    return [
      { label: "/status", insert: "/status", source: "mock" },
      { label: "$spawn", insert: "$spawn ", source: "mock" },
      { label: "Run tests", insert: "Run the test suite", source: "mock" },
    ];
  }
  return chips;
}
