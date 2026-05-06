import { describe, expect, it } from "vitest";
import { buildSuggestions } from "../suggestions";

describe("buildSuggestions", () => {
  it("prioritizes slash command aliases before skills", () => {
    const suggestions = buildSuggestions(
      [{ name: "status", textAliases: ["/status"], acceptsArgs: false }],
      [{ name: "weather", eligible: true, disabled: false, modelVisible: true, userInvocable: true, commandVisible: false }],
    );
    expect(suggestions.map((item) => item.insert)).toEqual(["/status", "$weather "]);
  });

  it("filters disabled and ineligible skills", () => {
    const suggestions = buildSuggestions([], [
      { name: "off", eligible: true, disabled: true, modelVisible: false, userInvocable: true, commandVisible: false },
      { name: "missing", eligible: false, disabled: false, modelVisible: false, userInvocable: true, commandVisible: false },
      { name: "ready", eligible: true, disabled: false, modelVisible: true, userInvocable: true, commandVisible: false },
    ]);
    expect(suggestions).toEqual([{ label: "$ready", insert: "$ready ", source: "skill" }]);
  });
});
