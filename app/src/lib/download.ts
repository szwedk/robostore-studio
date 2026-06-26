/** Trigger a client-side file download. */
export function downloadFile(name: string, content: string, mime = "application/json") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function framesToCSV(rows: { t: number; pos: number[] }[], headers: string[]): string {
  const head = ["t_ms", ...headers].join(",");
  const body = rows.map((r) => [r.t.toFixed(1), ...r.pos].join(",")).join("\n");
  return `${head}\n${body}`;
}

let counter = 0;
/** Small unique id without Math.random (kept deterministic-friendly). */
export function uid(prefix = "id"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}
