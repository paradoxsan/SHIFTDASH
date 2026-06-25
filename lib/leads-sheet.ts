// Sheet-backed agency lead pipeline (the Shift Digital CRM source of truth).
// The Leads tab has its header on row 3 and data from row 4 (matches the SDR's
// n8n nodes: headerRow=3, firstDataRow=4).
import { readSheet, updateRange } from "./google-sheets";
import { env } from "./env";
import type { SheetLead } from "./types";

const TAB = "Leads";
const HEADER_ROW = 3;

function columnLetter(idx: number): string {
  let s = "";
  let n = idx + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function nowIsrael(): string {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

export async function listLeads(): Promise<{ headers: string[]; leads: SheetLead[] }> {
  const sheetId = env.agencySheetId();
  const rows = await readSheet(sheetId, `${TAB}!A${HEADER_ROW}:Z2000`);
  const headers = (rows[0] || []).map((h) => String(h).trim());

  const leads: SheetLead[] = [];
  for (let k = 1; k < rows.length; k++) {
    const row = rows[k] || [];
    const values: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) values[h] = row[i] != null ? String(row[i]) : "";
    });
    if (!values["שם"] && !values["טלפון"] && !values["מזהה ליד"]) continue;
    const rowIndex = HEADER_ROW + k;
    leads.push({
      rowIndex,
      id: values["מזהה ליד"] || values["טלפון"] || `row-${rowIndex}`,
      values,
    });
  }
  return { headers, leads };
}

/**
 * Update specific cells of a lead's row by column header. Creates a new header
 * column on the fly (e.g. "תזכורת") if it doesn't exist yet. Only writes the
 * given fields — never clobbers untouched columns. Also stamps "עודכן לאחרונה".
 */
export async function updateLeadCells(
  rowIndex: number,
  updates: Record<string, string>
): Promise<void> {
  const sheetId = env.agencySheetId();
  const headerRow = (await readSheet(sheetId, `${TAB}!A${HEADER_ROW}:Z${HEADER_ROW}`))[0] || [];
  const headers = headerRow.map((h) => String(h).trim());

  const withStamp: Record<string, string> = { ...updates, "עודכן לאחרונה": nowIsrael() };

  for (const [header, value] of Object.entries(withStamp)) {
    let idx = headers.indexOf(header);
    if (idx < 0) {
      idx = headers.length;
      await updateRange(sheetId, `${TAB}!${columnLetter(idx)}${HEADER_ROW}`, [[header]]);
      headers.push(header);
    }
    await updateRange(sheetId, `${TAB}!${columnLetter(idx)}${rowIndex}`, [[value]]);
  }
}
