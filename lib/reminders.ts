// Pure date helpers for the lead follow-up reminders view (client-safe — no
// secrets, no server-only imports). Reminder dates live in the agency Sheet's
// "תזכורת" column as YYYY-MM-DD (written by an <input type="date">). All
// "today" math is anchored to Israel time so a late-night session still groups
// correctly against the business day.

export type ReminderBucket = "overdue" | "today" | "upcoming" | "later";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in Asia/Jerusalem as YYYY-MM-DD. */
export function todayInIsrael(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}

/**
 * Normalize a reminder cell to YYYY-MM-DD, or null if it isn't a usable date.
 * Accepts the ISO form the date-picker writes plus DD/MM/YYYY or DD.MM.YYYY a
 * human might type into the Sheet directly.
 */
export function parseReminder(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (ISO_RE.test(s)) return s;
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

/** Add n days to a YYYY-MM-DD string, returning YYYY-MM-DD (UTC math, no TZ drift). */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** Whole-day difference (toIso - fromIso); positive means toIso is in the future. */
export function dayDiff(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86_400_000);
}

/** Which bucket a reminder falls into relative to "today" (YYYY-MM-DD). */
export function bucketOf(reminderIso: string, today: string): ReminderBucket {
  const diff = dayDiff(today, reminderIso); // reminder − today
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= 7) return "upcoming";
  return "later";
}

/** True for reminders that need attention now (overdue or due today). */
export function isDueNow(reminderIso: string, today: string): boolean {
  const b = bucketOf(reminderIso, today);
  return b === "overdue" || b === "today";
}

/** Short Hebrew relative label, e.g. "היום", "מחר", "באיחור 3 ימים", "בעוד 5 ימים". */
export function relativeLabel(reminderIso: string, today: string): string {
  const diff = dayDiff(today, reminderIso);
  if (diff === 0) return "היום";
  if (diff === 1) return "מחר";
  if (diff === -1) return "אתמול";
  if (diff < 0) return `באיחור ${Math.abs(diff)} ימים`;
  return `בעוד ${diff} ימים`;
}
