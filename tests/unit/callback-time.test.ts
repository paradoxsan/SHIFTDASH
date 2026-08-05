import { describe, it, expect } from "vitest";
// plain .mjs, shared verbatim with the n8n Code node
import { resolveCallback, parseTime, fromWallClock, partsOf, hebrewLabel, nextOpen } from "../../lib/bot/callback-time.mjs";

/** Build a Jerusalem wall-clock instant so tests never hardcode a UTC offset. */
const at = (y: number, m: number, d: number, hh: number, mm = 0): Date => fromWallClock(y, m, d, hh, mm);
/** Render an instant back as Jerusalem wall clock. Throws on undefined so a
 *  resolver that unexpectedly refused shows up as a failure, not as "undefined". */
const wall = (dt: Date | undefined): string => {
  if (!dt) throw new Error("expected a resolved Date, got undefined");
  const p = partsOf(dt);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")} ${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}`;
};

// 2026-08-05 is a Wednesday; 08-07 Friday; 08-08 Saturday; 08-09 Sunday.
describe("parseTime", () => {
  it("accepts the shapes a model actually emits", () => {
    expect(parseTime("16:00")).toBe(960);
    expect(parseTime("9:05")).toBe(545);
    expect(parseTime("16.30")).toBe(990);
    expect(parseTime("1600")).toBe(960);
    expect(parseTime("16")).toBe(960);
  });
  it("rejects nonsense rather than guessing", () => {
    expect(parseTime("")).toBeNull();
    expect(parseTime("25:00")).toBeNull();
    expect(parseTime("16:70")).toBeNull();
    expect(parseTime("אחר הצהריים")).toBeNull();
    expect(parseTime(undefined)).toBeNull();
  });
});

describe("resolveCallback — the ordinary path", () => {
  it("schedules a call today and pings 30m early", () => {
    const now = at(2026, 8, 5, 11, 0); // Wed 11:00
    const r = resolveCallback({ day: "today", time: "16:00" }, "call", now);
    expect(r.ok).toBe(true);
    expect(wall(r.dueAt)).toBe("2026-08-05 16:00");
    expect(wall(r.fireAt)).toBe("2026-08-05 15:30");
    expect(r.label).toBe("היום ב-16:00");
  });

  it("fires a bot message exactly on time, no lead", () => {
    const now = at(2026, 8, 5, 11, 0);
    const r = resolveCallback({ day: "today", time: "16:00" }, "message", now);
    expect(wall(r.fireAt)).toBe("2026-08-05 16:00");
    expect(wall(r.dueAt)).toBe("2026-08-05 16:00");
  });

  it("handles tomorrow and named weekdays", () => {
    const now = at(2026, 8, 5, 11, 0); // Wednesday
    expect(wall(resolveCallback({ day: "tomorrow", time: "10:00" }, "call", now).dueAt)).toBe("2026-08-06 10:00");
    expect(wall(resolveCallback({ day: "מחר", time: "10:00" }, "call", now).dueAt)).toBe("2026-08-06 10:00");
    expect(wall(resolveCallback({ day: "sunday", time: "10:00" }, "call", now).dueAt)).toBe("2026-08-09 10:00");
    expect(wall(resolveCallback({ day: "ראשון", time: "10:00" }, "call", now).dueAt)).toBe("2026-08-09 10:00");
  });

  it("reads a same-weekday request as next week once that time has passed", () => {
    const now = at(2026, 8, 5, 16, 0); // Wednesday 16:00
    expect(wall(resolveCallback({ day: "wednesday", time: "10:00" }, "call", now).dueAt)).toBe("2026-08-12 10:00");
  });
});

describe("resolveCallback — times that would fire into a void", () => {
  it("reads 'at 4' said at 17:00 as tomorrow, not four hours ago", () => {
    const now = at(2026, 8, 5, 17, 0);
    const r = resolveCallback({ day: "today", time: "16:00" }, "call", now);
    expect(wall(r.dueAt)).toBe("2026-08-06 16:00");
    expect(r.adjusted).toBe(true);
  });

  it("moves a Saturday call to Sunday morning", () => {
    const now = at(2026, 8, 7, 10, 0); // Friday
    const r = resolveCallback({ day: "saturday", time: "12:00" }, "call", now);
    expect(wall(r.dueAt)).toBe("2026-08-09 09:00");
    expect(r.adjusted).toBe(true);
  });

  it("moves a Friday afternoon call past the 12:00 close", () => {
    const now = at(2026, 8, 7, 9, 0); // Friday 09:00
    const r = resolveCallback({ day: "today", time: "14:00" }, "call", now);
    expect(wall(r.dueAt)).toBe("2026-08-09 09:00");
  });

  it("never lets the bot message someone at 02:00", () => {
    const now = at(2026, 8, 5, 23, 0);
    const r = resolveCallback({ day: "tomorrow", time: "02:00" }, "message", now);
    expect(wall(r.dueAt)).toBe("2026-08-06 08:00");
  });

  it("keeps Shabbat clear for bot messages too", () => {
    const now = at(2026, 8, 7, 11, 0); // Friday
    const r = resolveCallback({ day: "saturday", time: "12:00" }, "message", now);
    expect(wall(r.dueAt)).toBe("2026-08-09 08:00");
  });
});

describe("resolveCallback — the fire_at guards", () => {
  it("clamps a near-term call to now+2m instead of the past", () => {
    const now = at(2026, 8, 5, 15, 50);
    const r = resolveCallback({ day: "today", time: "16:00" }, "call", now);
    expect(wall(r.dueAt)).toBe("2026-08-05 16:00");
    expect(wall(r.fireAt)).toBe("2026-08-05 15:52"); // not 15:30, which already passed
  });

  it("holds a pre-opening ping until the doors open", () => {
    const now = at(2026, 8, 5, 20, 0); // Wed evening, for a Thu 09:15 call
    const r = resolveCallback({ day: "tomorrow", time: "09:15" }, "call", now);
    expect(wall(r.dueAt)).toBe("2026-08-06 09:15");
    expect(wall(r.fireAt)).toBe("2026-08-06 09:00"); // not 08:45, when nobody is there
  });

  it("never returns fire_at after due_at", () => {
    const now = at(2026, 8, 5, 11, 0);
    for (const time of ["11:05", "12:00", "16:00", "17:00"]) {
      const r = resolveCallback({ day: "today", time }, "call", now);
      expect(r.ok).toBe(true);
      expect(new Date(wall(r.fireAt)).getTime()).toBeLessThanOrEqual(new Date(wall(r.dueAt)).getTime());
    }
  });
});

describe("resolveCallback — refusals", () => {
  it("refuses rather than inventing a time", () => {
    const now = at(2026, 8, 5, 11, 0);
    expect(resolveCallback({ day: "today", time: "בערב" }, "call", now)).toMatchObject({ ok: false, reason: "bad_time" });
    expect(resolveCallback({ day: "today" }, "call", now)).toMatchObject({ ok: false, reason: "bad_time" });
    expect(resolveCallback({ day: "today", time: "10:00" }, "whenever" as never, now)).toMatchObject({ ok: false, reason: "bad_mode" });
  });

  it("falls back to today when the day word is unrecognised", () => {
    const now = at(2026, 8, 5, 11, 0);
    expect(wall(resolveCallback({ day: "בקרוב", time: "16:00" }, "call", now).dueAt)).toBe("2026-08-05 16:00");
  });
});

describe("timezone correctness", () => {
  it("survives the DST boundary in both directions", () => {
    // Israel: IDT (UTC+3) in August, IST (UTC+2) in January.
    expect(at(2026, 8, 5, 12, 0).toISOString()).toBe("2026-08-05T09:00:00.000Z");
    expect(at(2026, 1, 5, 12, 0).toISOString()).toBe("2026-01-05T10:00:00.000Z");
  });

  it("labels relative days from the Jerusalem calendar, not UTC", () => {
    const now = at(2026, 8, 5, 23, 30); // 20:30 UTC — still the 5th locally
    expect(hebrewLabel(at(2026, 8, 6, 10, 0), now)).toBe("מחר ב-10:00");
    expect(hebrewLabel(at(2026, 8, 5, 23, 45), now)).toBe("היום ב-23:45");
  });

  it("nextOpen walks forward without stalling on closed days", () => {
    const sat = at(2026, 8, 8, 13, 0);
    expect(wall(nextOpen(sat, { 0: [540, 1020], 1: null, 2: null, 3: null, 4: null, 5: null, 6: null }))).toBe("2026-08-09 09:00");
  });
});
