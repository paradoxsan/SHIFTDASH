// Resolves the loose "call me back" time נועה emits into concrete instants.
//
// The agent only ever sees `[המערכת: עכשיו יום ___, השעה ___]` — a weekday and a
// wall-clock time, no date. So it emits `{day, time}` and ALL date arithmetic
// happens here, deterministically, instead of asking Gemini for an ISO stamp it
// has no calendar for.
//
// Plain .mjs (not .ts) on purpose: this exact source is read verbatim by
// n8n/scratch/apply-callbacks.mjs and inlined into the "Callback: Resolve" Code
// node, so the live bot and the unit tests run the same bytes.

/** Business hours, minutes-from-midnight in Asia/Jerusalem, index = getDay() (0=Sun). */
const CALL_HOURS = {
  0: [540, 1020], 1: [540, 1020], 2: [540, 1020], 3: [540, 1020], 4: [540, 1020],
  5: [510, 720],  // Friday 08:30–12:00
  6: null,        // Saturday closed
};

/** When the bot itself may message. Wider than CALL_HOURS — it works around the clock —
 *  but still not at 02:00, and not on Shabbat. Change these two tables and nothing else. */
export const MSG_HOURS = {
  0: [480, 1290], 1: [480, 1290], 2: [480, 1290], 3: [480, 1290], 4: [480, 1290],
  5: [480, 780],  // Friday 08:00–13:00
  6: null,
};

const LEAD_MINUTES = 30;  // how early a human is pinged before a call
const FLOOR_MINUTES = 2;  // never schedule inside the current poller tick

const DAY_WORDS = {
  today: 0, היום: 0,
  tomorrow: 1, מחר: 1,
};
const WEEKDAYS = {
  sunday: 0, ראשון: 0, monday: 1, שני: 1, tuesday: 2, שלישי: 2, wednesday: 3, רביעי: 3,
  thursday: 4, חמישי: 4, friday: 5, שישי: 5, saturday: 6, שבת: 6,
};
const HE_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/** Minutes east of UTC for Asia/Jerusalem at a given instant (DST-correct). */
function offsetMinutes(date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem", hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(date).map((x) => [x.type, x.value])
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, p.hour === "24" ? 0 : +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Jerusalem wall-clock breakdown of an instant. */
export function partsOf(date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem", hour12: false, weekday: "short",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(date).map((x) => [x.type, x.value])
  );
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  const hour = p.hour === "24" ? 0 : +p.hour;
  return { y: +p.year, m: +p.month, d: +p.day, hh: hour, mm: +p.minute, dow, mins: hour * 60 + +p.minute };
}

/** Jerusalem wall-clock → UTC instant. Two passes so DST transitions land right. */
export function fromWallClock(y, m, d, hh, mm) {
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  let ts = naive;
  for (let i = 0; i < 2; i++) ts = naive - offsetMinutes(new Date(ts)) * 60000;
  return new Date(ts);
}

/** Same wall-clock day, shifted by n days. */
function addDays(date, n) {
  const p = partsOf(date);
  return fromWallClock(p.y, p.m, p.d + n, p.hh, p.mm);
}

/** Earliest instant >= `date` that falls inside `hours`. Returns null if none within 14 days. */
export function nextOpen(date, hours) {
  let cur = date;
  for (let i = 0; i < 14; i++) {
    const p = partsOf(cur);
    const win = hours[p.dow];
    if (win) {
      if (p.mins < win[0]) return fromWallClock(p.y, p.m, p.d, 0, win[0]);
      if (p.mins <= win[1]) return cur;
    }
    // roll to 00:00 of the next day and retry
    const next = fromWallClock(p.y, p.m, p.d + 1, 0, 0);
    cur = next;
  }
  return null;
}

function isOpen(date, hours) {
  const p = partsOf(date);
  const win = hours[p.dow];
  return !!win && p.mins >= win[0] && p.mins <= win[1];
}

/** "HH:MM" / "H:MM" / "HH.MM" / "1600" → minutes from midnight, or null. */
export function parseTime(raw) {
  const s = String(raw ?? "").trim();
  let m = s.match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m) m = s.match(/^(\d{2})(\d{2})$/);
  if (!m) {
    const bare = s.match(/^(\d{1,2})$/);           // "16" → 16:00
    if (!bare) return null;
    const h0 = +bare[1];
    return h0 >= 0 && h0 <= 23 ? h0 * 60 : null;
  }
  const h = +m[1], min = +m[2];
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Hebrew label for the resolved instant, relative to `now`. */
export function hebrewLabel(due, now) {
  const d = partsOf(due), n = partsOf(now);
  const hhmm = `${String(d.hh).padStart(2, "0")}:${String(d.mm).padStart(2, "0")}`;
  const midnightDue = fromWallClock(d.y, d.m, d.d, 0, 0).getTime();
  const midnightNow = fromWallClock(n.y, n.m, n.d, 0, 0).getTime();
  const dayDiff = Math.round((midnightDue - midnightNow) / 86400000);
  if (dayDiff === 0) return `היום ב-${hhmm}`;
  if (dayDiff === 1) return `מחר ב-${hhmm}`;
  return `ביום ${HE_DAYS[d.dow]} ב-${hhmm}`;
}

/**
 * @param {{day?: string, time?: string}} req  what the agent emitted
 * @param {"call"|"message"} mode
 * @param {Date} now
 * @returns {{ok: boolean, reason?: string, dueAt?: Date, fireAt?: Date, label?: string, adjusted?: boolean}}
 */
export function resolveCallback(req, mode, now = new Date()) {
  const mins = parseTime(req?.time);
  if (mins === null) return { ok: false, reason: "bad_time" };
  if (mode !== "call" && mode !== "message") return { ok: false, reason: "bad_mode" };

  const hours = mode === "call" ? CALL_HOURS : MSG_HOURS;
  const dayRaw = String(req?.day ?? "today").trim().toLowerCase();
  const n = partsOf(now);

  let due;
  if (dayRaw in DAY_WORDS) {
    due = fromWallClock(n.y, n.m, n.d + DAY_WORDS[dayRaw], 0, mins);
  } else if (dayRaw in WEEKDAYS) {
    const target = WEEKDAYS[dayRaw];
    let delta = (target - n.dow + 7) % 7;
    if (delta === 0 && mins <= n.mins) delta = 7;   // "on Sunday" said on a Sunday afternoon
    due = fromWallClock(n.y, n.m, n.d + delta, 0, mins);
  } else {
    due = fromWallClock(n.y, n.m, n.d, 0, mins);     // unrecognised → treat as today
  }

  // "at 4" said at 17:00 means tomorrow, not four hours ago.
  let adjusted = false;
  if (due.getTime() <= now.getTime()) {
    due = addDays(due, 1);
    adjusted = true;
  }

  // Push into a window where the action is actually possible.
  if (!isOpen(due, hours)) {
    const open = nextOpen(due, hours);
    if (!open) return { ok: false, reason: "no_window" };
    due = open;
    adjusted = true;
  }

  // Humans get a head start; the bot fires exactly on time.
  let fire = mode === "call" ? new Date(due.getTime() - LEAD_MINUTES * 60000) : new Date(due.getTime());
  const floor = new Date(now.getTime() + FLOOR_MINUTES * 60000);
  if (fire.getTime() < floor.getTime()) fire = floor;
  // A ping 30m before opening just gets buried — hold it to the start of the window.
  if (mode === "call" && !isOpen(fire, hours)) {
    const open = nextOpen(fire, hours);
    if (open && open.getTime() <= due.getTime()) fire = open;
  }

  return { ok: true, dueAt: due, fireAt: fire, label: hebrewLabel(due, now), adjusted };
}
