// ── CSV export (BotOps Phase 9) — pure ────────────────────────────────────────
// Flatten rows to RFC-4180-ish CSV: quote any field containing a comma, quote, or
// newline; double internal quotes; objects → JSON. Pure → unit-tested.

function escapeCsv(value: unknown): string {
  const s = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  if (cols.length === 0) return "";
  const header = cols.map(escapeCsv).join(",");
  const body = rows.map((r) => cols.map((c) => escapeCsv(r[c])).join(",")).join("\n");
  return rows.length ? `${header}\n${body}\n` : `${header}\n`;
}
