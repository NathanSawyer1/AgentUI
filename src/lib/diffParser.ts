import type { DiffRow } from "./types";

function parseHunkStart(line: string): { oldLine: number; newLine: number } | null {
  const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);
  if (!match) return null;
  return { oldLine: Number(match[1]), newLine: Number(match[2]) };
}

export function parseUnifiedPatch(patch: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of patch.split(/\r?\n/)) {
    const hunk = parseHunkStart(line);
    if (hunk) {
      oldLine = hunk.oldLine;
      newLine = hunk.newLine;
      rows.push({ type: "hunk", label: line });
      continue;
    }
    if (!rows.length || line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ")) {
      continue;
    }
    if (line.startsWith("\\")) continue;

    const prefix = line[0];
    const code = line.slice(1);
    if (prefix === "-") {
      rows.push({
        old: { ln: oldLine++, code, kind: "del" },
        nw: { ln: 0, code: "", kind: "ctx" },
      });
    } else if (prefix === "+") {
      rows.push({
        old: { ln: 0, code: "", kind: "ctx" },
        nw: { ln: newLine++, code, kind: "add" },
      });
    } else {
      rows.push({
        old: { ln: oldLine++, code: line.startsWith(" ") ? code : line, kind: "ctx" },
        nw: { ln: newLine++, code: line.startsWith(" ") ? code : line, kind: "ctx" },
      });
    }
  }

  return rows;
}
