import { describe, it, expect } from "vitest";
// plain .mjs, shared verbatim with the n8n Code node ("Classify Takeover")
import {
  classifyOwnerMessage,
  decideTakeover,
  parseGroupCommand,
  TAKEOVER_CONFIG,
} from "../../lib/bot/takeover.mjs";
import { fromWallClock, partsOf } from "../../lib/bot/callback-time.mjs";

// Minimal WHAPI message shapes, as they arrive on the webhook.
const text = (body: string, source = "mobile") => ({
  from_me: true, source, type: "text", text: { body }, chat_id: "972501234567@s.whatsapp.net",
});
const ofType = (type: string, extra: Record<string, unknown> = {}, source = "mobile") => ({
  from_me: true, source, type, chat_id: "972501234567@s.whatsapp.net", ...extra,
});
const kind = (m: unknown) => classifyOwnerMessage(m).kind;

const at = (y: number, m: number, d: number, hh: number, mm = 0): Date => fromWallClock(y, m, d, hh, mm);
const wall = (iso: string | null): string => {
  if (!iso) throw new Error("expected a timestamp");
  const p = partsOf(new Date(iso));
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")} ${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}`;
};

// Every phrase below is taken from what the T-Center owner actually wrote to
// customers (chat_messages, role=agent, last 60 days) — not invented examples.
describe("classifyOwnerMessage — order is done / in production → close", () => {
  it.each([
    "ההזמנה מוכנה",
    "היי ההזמנה מוכנה",
    "בוקר טוב ההזמנה מוכנה עובדים עד 14.00",
    "היי ההזמנה מוכנה אפשר להגיע לקחת",
    "ההזמנה בהכנה",
    "מוכן",
    "מוכן אחי",
    "כן מוכן",
    "הכל מוכן",
    "מחר יהיה מוכן",
    "היום יהיה מוכן",
    "עוד שעה יהיה מוכן",
    "מחר יהיה מוכן אודיע לך",
    "מכין לך להיום",
    "אכין לך למחר",
    "אפשר להגיע לקחת",
    "השליח בדרך",
    "אודיע לך",
    "אודיע לך שמוכן",
    "תקבלי הודעה",
    "אני מטפל בהזמנה",
  ])("%s", (body) => {
    expect(kind(text(body))).toBe("close");
  });
});

describe("classifyOwnerMessage — payment / closing the sale → close", () => {
  it.each([
    "תודה מתקדם",
    "שוליח לינק לתשלום ומתקדם",
    "שוליח לינק לתשלום",
    "בבקשה להעביר תשלום שנוכל להתקדם",
    "בוקר טוב קיבלתי את ההזמנה שוליח לינק לתשלום ומחר יהיה מוכן",
    "שולם",
    "סגור תודה",
    "תודה רבה שקניתם ב-T-Center 🙏 נשמח מאוד אם תוכלו להשאיר לנו ביקורת בגוגל על השירות שקיבלתם",
  ])("%s", (body) => {
    expect(kind(text(body))).toBe("close");
  });

  it("a payment link pasted by hand (EZcount link preview) closes the chat", () => {
    const m = ofType("link_preview", { link_preview: { url: "https://www.ezcount.co.il/dp/?x=1", body: "" } }, "web");
    expect(classifyOwnerMessage(m)).toMatchObject({ kind: "close", reason: "payment_link" });
  });

  it("a voice note whose transcript says the order is being worked on closes the chat", () => {
    const m = { ...ofType("voice"), transcript: "היי, מה שלומך? תראה, עובדים על ההזמנה הזאת" };
    expect(kind(m)).toBe("close");
  });
});

describe("classifyOwnerMessage — the owner is mid-conversation → handling (short pause)", () => {
  it.each([
    ".",
    "היי",
    "בודק",
    "שניה בודק",
    "מצלם",
    "כן",
    "סבבה",
    "על שם מי החשבונית??",
    "מה המידות",
    "45ש לקפצון",
    "בכמה יחידות מדובר??",
    // the 45-day replay closed these until midnight; the owner is disputing or asking about payment
    "ההזמנה לא שולמה",
    "לא שילמת",
    "איך שילמת",
    "כן אבל שילמת 385",
  ])("%s", (body) => {
    expect(kind(text(body))).toBe("handling");
  });

  it("negations are not 'ready': 'זה לא מוכן' / 'עוד לא מוכן'", () => {
    expect(kind(text("זה לא מוכן"))).toBe("handling");
    expect(kind(text("עוד לא מוכן אחי"))).toBe("handling");
  });

  it("a question is not a declaration: 'מוכן?' / 'שולם?'", () => {
    expect(kind(text("מוכן?"))).toBe("handling");
    expect(kind(text("שולם?"))).toBe("handling");
  });

  it("quoting the customer is not a declaration: 'הוא אמר ששילם'", () => {
    expect(kind(text("הוא אמר ששולם"))).toBe("handling");
  });

  it.each(["voice", "image", "sticker", "video", "document", "album"])(
    "a %s from the owner pauses the bot even with no text",
    (type) => {
      expect(kind(ofType(type))).toBe("handling");
    }
  );

  it("a reaction from the owner counts as handling", () => {
    expect(kind(ofType("action", { action: { type: "reaction", emoji: "👍" } }))).toBe("handling");
  });
});

describe("classifyOwnerMessage — explicit hand-back → release", () => {
  it.each(["🤖", " 🤖 ", "#בוט"])("%s", (body) => {
    expect(kind(text(body))).toBe("release");
  });
});

describe("classifyOwnerMessage — not a human at all → ignore", () => {
  it("the bot's own sends (source=api) are ignored", () => {
    expect(kind(text("ההזמנה מוכנה", "api"))).toBe("ignore");
  });
  it("customer messages (from_me=false) are ignored", () => {
    expect(kind({ ...text("ההזמנה מוכנה"), from_me: false })).toBe("ignore");
  });
  it("a deleted message (system action) is ignored", () => {
    expect(kind(ofType("action", { action: { type: "delete", target: "x" } }, "system"))).toBe("ignore");
  });
  it("garbage input does not throw", () => {
    expect(kind(null)).toBe("ignore");
    expect(kind({})).toBe("ignore");
  });
});

describe("decideTakeover — what gets written to human_mode", () => {
  const now = at(2026, 11, 24, 10, 0); // Tuesday 10:00 Israel

  it("handling → silence for the configured window, sliding from now", () => {
    const d = decideTakeover(text("בודק"), now);
    expect(d.action).toBe("silence");
    expect(d.row).toEqual({ active: true, silenced_until: new Date(now.getTime() + TAKEOVER_CONFIG.handlingMinutes * 60000).toISOString() });
  });

  it("close → silence until the start of the next day (Israel time)", () => {
    const d = decideTakeover(text("ההזמנה מוכנה"), now);
    expect(d.action).toBe("silence");
    expect(wall(d.row!.silenced_until)).toBe("2026-11-25 00:00");
  });

  it("close late at night still lasts until the following midnight, not 5 minutes", () => {
    const d = decideTakeover(text("מחר יהיה מוכן"), at(2026, 11, 24, 23, 55));
    expect(wall(d.row!.silenced_until)).toBe("2026-11-25 00:00");
  });

  it("release → bot active again immediately", () => {
    const d = decideTakeover(text("🤖"), now);
    expect(d.action).toBe("release");
    expect(d.row).toEqual({ active: false, silenced_until: now.toISOString() });
  });

  it("a sticker after 'ההזמנה מוכנה' does not shorten the quiet-until-midnight window", () => {
    const current = { active: true, silenced_until: at(2026, 11, 25, 0, 0).toISOString() };
    const d = decideTakeover(ofType("sticker"), now, current);
    expect(wall(d.row!.silenced_until)).toBe("2026-11-25 00:00");
  });

  it("an expired or released row does not hold the window open", () => {
    const old = { active: true, silenced_until: at(2026, 11, 23, 0, 0).toISOString() };
    expect(decideTakeover(text("בודק"), now, old).row!.silenced_until).toBe(new Date(now.getTime() + TAKEOVER_CONFIG.handlingMinutes * 60000).toISOString());
    const released = { active: false, silenced_until: at(2026, 11, 26, 0, 0).toISOString() };
    expect(decideTakeover(text("בודק"), now, released).row!.silenced_until).toBe(new Date(now.getTime() + TAKEOVER_CONFIG.handlingMinutes * 60000).toISOString());
  });

  it("an explicit 🤖 releases even inside a long silence", () => {
    const current = { active: true, silenced_until: at(2026, 11, 25, 0, 0).toISOString() };
    expect(decideTakeover(text("🤖"), now, current).action).toBe("release");
  });

  it("ignore → nothing written", () => {
    const d = decideTakeover(text("שלום", "api"), now);
    expect(d.action).toBe("ignore");
    expect(d.row).toBeNull();
  });
});

describe("parseGroupCommand — managing a chat from the orders group", () => {
  const alertCard = "🔔 לקוח מבקש מענה אישי / נציג\n\nשם: דנה\nטלפון: +972501234567\nפתיחת צ'אט עם הלקוח: https://wa.me/972501234567";

  it("replying 'בוט' to an alert card hands the chat back to the bot", () => {
    expect(parseGroupCommand("בוט", alertCard)).toEqual({ action: "release", chatId: "972501234567@s.whatsapp.net" });
  });

  it("replying 'שקט' to an alert card silences the bot for that chat", () => {
    expect(parseGroupCommand("שקט", alertCard)).toEqual({ action: "close", chatId: "972501234567@s.whatsapp.net" });
  });

  it("every documented alias works, including the two-word ones that start with 'בוט'", () => {
    for (const t of ["בוט", "בוט חזור", "החזר בוט", "תחזיר בוט", "🤖"]) expect(parseGroupCommand(t, alertCard)?.action, t).toBe("release");
    for (const t of ["שקט", "השתק", "כבה בוט", "בוט כבוי", "🔇"]) expect(parseGroupCommand(t, alertCard)?.action, t).toBe("close");
  });

  it("a local phone number typed after the command works without a quoted card", () => {
    expect(parseGroupCommand("בוט 050-1234567", "")).toEqual({ action: "release", chatId: "972501234567@s.whatsapp.net" });
  });

  it("ordinary group chatter is not a command", () => {
    expect(parseGroupCommand("מישהו ראה את ההזמנה של דנה?", alertCard)).toBeNull();
    expect(parseGroupCommand("בוט", "")).toBeNull(); // a command with no target does nothing
  });
});
