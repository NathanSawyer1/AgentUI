import type { DiffFile, DiffRow } from "./types";

export function filterDiffFiles(files: DiffFile[], query: string): DiffFile[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return files;
  return files.filter((file) => {
    const path = file.path.toLowerCase();
    const oldPath = file.oldPath?.toLowerCase() ?? "";
    return path.includes(needle) || oldPath.includes(needle);
  });
}

export function patchTextForClipboard(patch: string | undefined, rows: DiffRow[]): string {
  if (patch && patch.trim()) return patch;
  if (rows.length === 0) return "No patch available for this file.";
  return rows
    .map((row) => {
      if ("type" in row) return row.label;
      if (row.old.kind === "del") return `-${row.old.code}`;
      if (row.nw.kind === "add") return `+${row.nw.code}`;
      return ` ${row.nw.code || row.old.code}`;
    })
    .join("\n");
}
