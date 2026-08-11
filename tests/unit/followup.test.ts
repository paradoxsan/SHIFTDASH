import { describe, it, expect } from "vitest";
// plain .mjs, shared verbatim with the n8n Code node
import { resolveFollowup, detectThink, renderFollowup, usableName, decideSend, groupLine, buildFollowupPrompt, validateFollowupText, pickFollowupText, forbiddenClaim } from "../../lib/bot/followup.mjs";
import { fromWallClock, partsOf } from "../../lib/bot/callback-time.mjs";

const at = (y: number, m: number, d: number, hh: number, mm = 0): Date => fromWallClock(y, m, d, hh, mm);
const wall = (dt: Date | undefined): string => {
  if (!dt) throw new Error("expected a resolved Date, got undefined");
  const p = partsOf(dt);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")} ${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}`;
};

// 2026-08-05 Wed · 08-06 Thu · 08-07 Fri · 08-08 Sat · 08-09 Sun
describe("resolveFollowup — when the nudge may go out", () => {
  it("fires exactly N hours later when that lands mid-day", () => {
    const r = resolveFollowup(at(2026, 8, 5, 12, 0), 3, at(2026, 8, 5, 12, 0));
    expect(r.ok).toBe(true);
    expect(wall(r.dueAt)).toBe("2026-08-05 15:00");
    expect(wall(r.fireAt)).toBe("2026-08-05 15:00");
    expect(r.deferred).toBe(false);
  });

  it("never messages in the middle of the night — a 23:00 anchor waits for morning", () => {
    const r = resolveFollowup(at(2026, 8, 5, 23, 0), 3, at(2026, 8, 5, 23, 0));
    expect(wall(r.dueAt)).toBe("2026-08-06 02:00");
    expect(wall(r.fireAt)).toBe("2026-08-06 08:00");
    expect(r.deferred).toBe(true);
  });

  it("never messages on Shabbat — a Friday afternoon nudge lands Sunday morning", () => {
    const r = resolveFollowup(at(2026, 8, 7, 12, 0), 3, at(2026, 8, 7, 12, 0));
    expect(wall(r.dueAt)).toBe("2026-08-07 15:00");   // Friday 15:00, shop shut at 13:00
    expect(wall(r.fireAt)).toBe("2026-08-09 08:00");  // Sunday morning
    expect(r.deferred).toBe(true);
  });

  it("carries the 24h stage over Shabbat too", () => {
    const r = resolveFollowup(at(2026, 8, 7, 10, 0), 24, at(2026, 8, 7, 10, 0));
    expect(wall(r.dueAt)).toBe("2026-08-08 10:00");   // Saturday
    expect(wall(r.fireAt)).toBe("2026-08-09 08:00");
  });

  it("holds a Friday-morning 3h nudge inside the short Friday window", () => {
    const r = resolveFollowup(at(2026, 8, 7, 9, 0), 3, at(2026, 8, 7, 9, 0));
    expect(wall(r.fireAt)).toBe("2026-08-07 12:00");
    expect(r.deferred).toBe(false);
  });

  it("floors a fire time that is already in the past so it cannot miss a tick", () => {
    const now = at(2026, 8, 5, 18, 0);
    const r = resolveFollowup(at(2026, 8, 5, 12, 0), 3, now);
    expect(r.fireAt!.getTime()).toBe(now.getTime() + 2 * 60000);
  });

  // Found by running the real 972543103299 chat through the resolver: its 12:58
  // Friday target was already overdue, and flooring it to "now" put it at 14:56
  // on a Friday — past closing, heading into Shabbat.
  it("re-clamps after flooring so a backlogged nudge cannot escape the window", () => {
    const r = resolveFollowup(at(2026, 8, 7, 9, 58), 3, at(2026, 8, 7, 14, 54));
    expect(wall(r.dueAt)).toBe("2026-08-07 12:58");
    expect(wall(r.fireAt)).toBe("2026-08-09 08:00"); // Sunday, not Friday afternoon
    expect(r.deferred).toBe(true);
  });

  it("still floors normally when now is inside the window", () => {
    const now = at(2026, 8, 5, 11, 0); // Wednesday, open
    const r = resolveFollowup(at(2026, 8, 5, 6, 0), 3, now);
    expect(r.fireAt!.getTime()).toBe(now.getTime() + 2 * 60000);
    expect(wall(r.fireAt)).toBe("2026-08-05 11:02");
  });

  it("refuses nonsense instead of guessing", () => {
    expect(resolveFollowup("not-a-date", 3, at(2026, 8, 5, 12, 0)).ok).toBe(false);
    expect(resolveFollowup(at(2026, 8, 5, 12, 0), 0, at(2026, 8, 5, 12, 0)).ok).toBe(false);
    expect(resolveFollowup(at(2026, 8, 5, 12, 0), -3, at(2026, 8, 5, 12, 0)).ok).toBe(false);
  });
});

const WORDS = "אחשוב,נחשוב,לחשוב,אתייעץ,להתייעץ,מתלבט,מתלבטת,אשקול,לשקול";

describe("detectThink", () => {
  it("catches the phrasings a customer actually uses", () => {
    expect(detectThink("אחשוב על זה ואחזור אליך", WORDS)).toBe(true);
    expect(detectThink("תודה, אני צריך לחשוב", WORDS)).toBe(true);
    expect(detectThink("אתייעץ עם אשתי", WORDS)).toBe(true);
    expect(detectThink("עדיין מתלבטת בין השניים", WORDS)).toBe(true);
  });
  it("does not fire on ordinary buying messages", () => {
    expect(detectThink("אפשר להזמין", WORDS)).toBe(false);
    expect(detectThink("כמה זה עולה?", WORDS)).toBe(false);
    expect(detectThink("", WORDS)).toBe(false);
    expect(detectThink(null, WORDS)).toBe(false);
  });
  it("accepts an array as well as the config CSV", () => {
    expect(detectThink("אחשוב על זה", ["אחשוב"])).toBe(true);
    expect(detectThink("אחשוב על זה", "")).toBe(false);
  });
});

describe("renderFollowup", () => {
  it("fills the name", () => {
    expect(renderFollowup("היי {name} 🙂 מה נשמע", { name: "סמדר" })).toBe("היי סמדר 🙂 מה נשמע");
  });
  it("never ships a literal {name} when the lead is anonymous", () => {
    expect(renderFollowup("היי {name} 🙂 מה נשמע", {})).toBe("היי 🙂 מה נשמע");
    expect(renderFollowup("היי {name}, עבר יום", { name: "  " })).toBe("היי, עבר יום");
  });

  // All three real leads in the live sample had a unusable profile name at first.
  it("drops WhatsApp profile names that are not personal names", () => {
    expect(renderFollowup("היי {name} 🙂", { name: "ga group" })).toBe("היי 🙂");
    expect(renderFollowup("היי {name} 🙂", { name: "0528721249" })).toBe("היי 🙂");
    expect(renderFollowup("היי {name} 🙂", { name: "🪬🪬" })).toBe("היי 🙂");
  });

  it("keeps a real Hebrew name and strips decoration around it", () => {
    expect(usableName("סמדר מימוני")).toBe("סמדר מימוני");
    expect(usableName("🪬 ליאור צחר סטון 🪬")).toBe("ליאור צחר סטון");
    expect(renderFollowup("היי {name} 🙂", { name: "חזו רותי" })).toBe("היי חזו רותי 🙂");
  });
});

const base = {
  enabled: true, stage: 1 as const, paused: false, approved: true,
  anchorMsgId: "MSG_A", anchorAt: at(2026, 8, 5, 12, 0), orderedAt: null, inWindow: true,
  newest: { id: "MSG_A", from_me: true, source: "api" },
};

describe("decideSend — the last gate before a real customer is messaged", () => {
  it("sends when the bot's message is still the last word in the chat", () => {
    expect(decideSend(base)).toEqual({ send: true, reason: "ok" });
  });

  it("never sends while the owner has taken the chat over", () => {
    expect(decideSend({ ...base, paused: true }).reason).toBe("human_takeover");
  });

  it("never messages the owner's own customers — campaign leads only", () => {
    expect(decideSend({ ...base, approved: false }).reason).toBe("not_campaign");
  });

  it("stops when the customer already replied", () => {
    const newest = { id: "MSG_B", from_me: false, source: "mobile" };
    expect(decideSend({ ...base, newest }).reason).toBe("customer_replied");
  });

  it("stops when the owner answered from his phone — the case the DB cannot see", () => {
    const newest = { id: "MSG_B", from_me: true, source: "mobile" };
    expect(decideSend({ ...base, newest }).reason).toBe("human_replied");
  });

  it("stops when a newer bot message means this schedule is stale", () => {
    const newest = { id: "MSG_B", from_me: true, source: "api" };
    expect(decideSend({ ...base, newest }).reason).toBe("stale_anchor");
  });

  it("fails closed when the chat state cannot be read at all", () => {
    expect(decideSend({ ...base, newest: null }).reason).toBe("no_chat_state");
    expect(decideSend({ ...base, newest: {} }).reason).toBe("no_chat_state");
  });

  it("does not chase someone who already ordered", () => {
    expect(decideSend({ ...base, orderedAt: at(2026, 8, 5, 13, 0) }).reason).toBe("already_ordered");
  });

  it("ignores an order that predates the anchor — that is a returning customer", () => {
    expect(decideSend({ ...base, orderedAt: at(2026, 7, 1, 13, 0) }).send).toBe(true);
  });

  it("defers rather than cancels outside messaging hours", () => {
    expect(decideSend({ ...base, inWindow: false }).reason).toBe("outside_hours");
  });

  it("is off unless explicitly enabled", () => {
    expect(decideSend({ ...base, enabled: false }).reason).toBe("disabled");
  });

  it("rejects a stage the cascade does not define", () => {
    expect(decideSend({ ...base, stage: 3 }).reason).toBe("bad_stage");
    expect(decideSend({ ...base, stage: undefined }).reason).toBe("bad_stage");
  });

  it("checks takeover before campaign membership so an admin chat still cannot be nudged mid-takeover", () => {
    expect(decideSend({ ...base, paused: true, approved: false }).reason).toBe("human_takeover");
  });
});

const HIST = [
  { role: "user", text: "אני רוצה את הסט" },
  { role: "bot", text: "הסט המלא ב-1,999 ₪ ✨ נתראה ביום שני ב-16:30. מה השם המלא?" },
];

describe("validateFollowupText — the gate between the model and a customer", () => {
  it("accepts a clean contextual nudge", () => {
    const v = validateFollowupText("היי, רק חסר לי השם המלא כדי לתאם לך את ההגעה ליום שני 🙂", { history: HIST });
    expect(v.ok).toBe(true);
  });

  it("strips the quoting and fencing models add despite instructions", () => {
    const v = validateFollowupText('```\n"היי, חסר לי רק השם המלא כדי לתאם לך את ההגעה"\n```', { history: HIST });
    expect(v.ok).toBe(true);
    expect(v.text).toBe("היי, חסר לי רק השם המלא כדי לתאם לך את ההגעה");
  });

  it("refuses a price nobody authorised", () => {
    const v = validateFollowupText("היי, אוכל לתת לך את הסט ב-1,500 ₪ אם תסגור היום", { history: HIST });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("invented_number:1500");
  });

  it("allows a number that was already agreed in the conversation", () => {
    const v = validateFollowupText("היי, מזכירה לך את הסט ב-1,999 ₪ ליום שני", { history: HIST });
    expect(v.ok).toBe(true);
  });

  it("refuses machine markers, JSON and empty output", () => {
    expect(validateFollowupText("היי [HANDOFF: מחיר]", { history: HIST }).reason).toBe("machine_marker");
    expect(validateFollowupText('{"text": "היי"}', { history: HIST }).reason).toBe("looks_like_json");
    expect(validateFollowupText("   ", { history: HIST }).reason).toBe("empty");
    expect(validateFollowupText("hello there", { history: HIST }).reason).toBe("not_hebrew");
  });

  // Both of these came out of a real gemini-3.5-flash call whose thinking tokens
  // ate the output budget. They look fine and would have been sent to a customer.
  it("refuses a truncated generation the content checks would happily pass", () => {
    expect(validateFollowupText("היי, רק רציתי", { history: HIST }).reason).toBe("too_short");
    expect(validateFollowupText("רותי, רק צריכה את", { history: HIST }).reason).toBe("too_short");
  });

  it("trusts finishReason over how finished the text looks", () => {
    const cut = validateFollowupText(
      "היי רותי, רק חסר לי השם המלא שלך כדי לתאם את ההגעה ליום שני",
      { history: HIST, finishReason: "MAX_TOKENS" }
    );
    expect(cut.ok).toBe(false);
    expect(cut.reason).toBe("truncated:MAX_TOKENS");
  });

  it("accepts a complete generation with finishReason STOP", () => {
    const ok = validateFollowupText(
      "היי רותי, רק חסר לי השם המלא שלך כדי לתאם את ההגעה ליום שני 🙂",
      { history: HIST, finishReason: "STOP" }
    );
    expect(ok.ok).toBe(true);
  });

  it("refuses an essay or an interrogation", () => {
    expect(validateFollowupText("היי ".repeat(120), { history: HIST }).reason).toBe("too_long");
    expect(validateFollowupText("מה שלומך? רוצה? מתי? איפה?", { history: HIST }).reason).toBe("interrogation");
  });
});

// נועה told a real lead "רק בשביל לתאם לך את ההגעה" on 2026-08-07. No reservation
// mechanism exists — she extrapolated it from the [VISIT] wording.
describe("forbidden capability claims", () => {
  it("refuses the reservation נועה invented on a live lead", () => {
    const v = validateFollowupText(
      "היי רותי, רק צריכה שם מלא כדי לשריין לך את הסט ליום שני 🙂", { history: HIST }
    );
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("invented_capability:לשריין");
  });

  it("refuses holding an item and inventing stock", () => {
    expect(validateFollowupText("היי, אשמור לך את הסט עד יום ראשון בבוקר", { history: HIST }).reason)
      .toBe("invented_capability:אשמור לך");
    expect(validateFollowupText("היי רותי, יש במלאי בדיוק אחד אחרון אז כדאי למהר", { history: HIST }).reason)
      .toBe("invented_capability:יש במלאי");
  });

  it("allows the honest version of the same message", () => {
    const v = validateFollowupText(
      "היי רותי, רק צריכה שם מלא וטלפון כדי שנציג יאשר לך סופית את יום שני 🙂", { history: HIST }
    );
    expect(v.ok).toBe(true);
  });

  // The live bot's correct answer contains the forbidden word inside its own
  // disclaimer: "אני לא יכולה לשריין בעצמי, אבל אבקש מהמנהל…". A plain substring
  // match rejected it, which would have discarded a good message.
  it("does not flag a capability the bot is explicitly disclaiming", () => {
    expect(forbiddenClaim("אני לא יכולה לשריין בעצמי, אבל אבקש מהמנהל שישמור לך")).toBeNull();
    expect(forbiddenClaim("אין לי אפשרות, אני לא שומרת לך פריטים בעצמי")).toBeNull();
  });

  it("still catches the same word used as a real promise", () => {
    expect(forbiddenClaim("רק בשביל לשריין לך את הסט ליום שני")).toBe("לשריין");
    // negated once, claimed later — the claim still counts
    expect(forbiddenClaim("אני לא יכולה לשריין בעצמי. בסדר, לשריין לך עד מחר")).toBe("לשריין");
  });

  it("takes the list from config so the shop can extend it without a deploy", () => {
    expect(validateFollowupText("היי, נשלח לך שליח פרטי עד הבית מחר בבוקר", {
      history: HIST, forbiddenClaims: "שליח פרטי",
    }).reason).toBe("invented_capability:שליח פרטי");
  });

  it("tells the model it has no inventory and no calendar", () => {
    const p = buildFollowupPrompt({ history: HIST });
    expect(p).toContain("אין לך מערכת מלאי");
    expect(p).toContain("אבדוק עם נציג");
  });
});

describe("pickFollowupText — never ships nothing", () => {
  const template = "היי {name} 🙂 רק מוודאת שלא פספסתי אותך";

  it("prefers the contextual message when it is clean", () => {
    const r = pickFollowupText({ generated: "היי, חסר לי רק השם המלא לתאם את ההגעה", template, name: "רותי", history: HIST });
    expect(r.source).toBe("generated");
    expect(r.text).toContain("השם המלא");
  });

  it("falls back to the approved template when generation misbehaves", () => {
    const r = pickFollowupText({ generated: "אתן לך אותו ב-900 ₪", template, name: "רותי", history: HIST });
    expect(r.source).toBe("template");
    expect(r.reason).toBe("invented_number:900");
    expect(r.text).toBe("היי רותי 🙂 רק מוודאת שלא פספסתי אותך");
  });

  it("falls back when the model returned nothing at all", () => {
    for (const g of [null, undefined, "", "   "]) {
      const r = pickFollowupText({ generated: g, template, name: "רותי", history: HIST });
      expect(r.source).toBe("template");
      expect(r.reason).toBe("no_generation");
    }
  });
});

describe("buildFollowupPrompt", () => {
  it("carries the real conversation and forbids inventing offers", () => {
    const p = buildFollowupPrompt({ history: HIST, stage: 1, trigger: "silence", name: "רותי", hoursSilent: 3 });
    expect(p).toContain("מה השם המלא");
    expect(p).toContain("אסור להציע מחיר");
    expect(p).toContain("רותי");
  });
  it("tells the model not to invent a name when there is none", () => {
    expect(buildFollowupPrompt({ history: HIST })).toContain("אל תמציאי שם");
  });
  it("asks for a graceful exit on the second and final nudge", () => {
    expect(buildFollowupPrompt({ history: HIST, stage: 2 })).toContain("אחרונה");
  });
});

describe("groupLine", () => {
  it("uses real newlines, never a literal backslash-n", () => {
    const line = groupLine({ stage: 1, trigger: "silence", name: "סמדר", phone: "972528721249@s.whatsapp.net" });
    expect(line).not.toContain("\\n");
    expect(line.split("\n")).toHaveLength(4);
    expect(line).toContain("972528721249");
    expect(line).toContain("לא הגיב");
  });
  it("labels the second stage and the think trigger", () => {
    const line = groupLine({ stage: 2, trigger: "think", name: "", phone: "" });
    expect(line).toContain("שני (24 שעות)");
    expect(line).toContain("אמר שהוא חושב על זה");
    expect(line).toContain("לקוח");
  });
});
