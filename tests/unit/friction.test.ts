import { describe, it, expect } from "vitest";
// plain .mjs, shared verbatim with the n8n Code node ("Friction Gate")
import {
  cleanCustomerText,
  detectFriction,
  decideFriction,
  isRepeat,
  reminderAlert,
  isShopOpen,
  groupAlert,
  historyBefore,
  repeatGuard,
} from "../../lib/bot/friction.mjs";

const NOW = new Date("2026-11-24T10:00:00Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60000).toISOString();
const u = (text: string, min = 5) => ({ role: "user", text, at: ago(min) });
const b = (text: string, min = 5) => ({ role: "bot", text, at: ago(min) });
const a = (text: string, min = 5) => ({ role: "agent", text, at: ago(min) });

// The customer lines below are real T-Center messages (names/phones removed).
describe("cleanCustomerText — the detector reads what the customer typed, not our markers", () => {
  it("drops the quoted-reply marker, which contains the word 'בוט'", () => {
    const raw = '[הלקוח השיב על הודעה קודמת מ-בוט/הצוות: "משלוח או איסוף עצמי?"] כמה עולה משלוח?';
    expect(cleanCustomerText(raw)).toBe("כמה עולה משלוח?");
  });
  it("drops the voice-transcript label and the system clock note", () => {
    expect(cleanCustomerText("[הקלטה קולית מהלקוח (4 שניות), תומלל]: אפשר נציג\n[המערכת: עכשיו יום שני, השעה 10:00. העסק פתוח כרגע.]")).toBe("אפשר נציג");
  });
  it("a quoted marker alone is not friction", () => {
    const raw = '[הלקוח השיב על הודעה קודמת מ-בוט/הצוות: "🔗 לינק תשלום ידני על סך 350 ₪"] סבבה';
    expect(detectFriction(raw).score).toBe(0);
  });
});

describe("detectFriction — asking for a person", () => {
  it.each([
    "אני מבקשת שנציג אנושי יחזור אלי",
    "כן אבל אפשר לדבר עם נציג? אני רוצה לוודא שזה יכול להיות מוכן היום",
    "אפשר נציג אנושי?",
    "אפשר לדבר עם נציג שירות?",
    "נציג שירות",
    "היי אשמח למענה מבן אדם🙏🏽",
    "אני אשמח לדבר עם אסי כי הוא מכיר אותי",
    "יש לי בעיה עם הבגדים שקיבלתי מכם. מבקשת לדבר עם מנהל",
    "אפשר לענות לטלפון ??",
    "היי האם יש נציג זמין?",
    // second sample, last 14 days — misses the first version of the rules let through
    "תביא לי נציג עכשיו בבקשה, דחוף",
    "הכי טוב שנציג שלכם יחזור אלי לסגור הכל. זה לא מובן בווטסאפ",
    "האם נציג ידבר איתי?",
    "תודה רבה , מתי יגיע רק נציג כי אנחנו רוצים לסגור את ההזמנה",
    "מחכה שנציג אמיתי יענה ויאשר את ההזמנה",
    "אתם יכולים להתקשר אלי בבקשה. אי אפשר ככה",
    "שומע אפשר לדבר בטלפון מחר בבוקר יותר פשוט",
    "לא, לא, תשלח לי שיהיה לי נציג בבקשה. די, זה בוט לא נורמלי.",
  ])("%s", (text) => {
    expect(detectFriction(text).wantsHuman).toBe(true);
  });

  it.each([
    "הנציג אמר לי שזה יהיה מוכן מחר",
    "דיברתי עם הנציג ששלחת לדבר איתי הוא אמר 16 ש״ח.",
    "בקשתי מכל נציגת כיתה לפנות אליך ישירות - פנו אליך?",
    "המנהל אישר חצי תשלום וחצי תשלום בעת קבלת החולצות?",
    "דיברתי עם אסי ואמרתי לו שזה כיתה קטנה",
    "אני עומד כאן בחנות מול אסי.",
    "קח טלפון, קח טלפון של הבן אדם.",
  ])("talking ABOUT a person is not asking for one: %s", (text) => {
    expect(detectFriction(text).wantsHuman).toBe(false);
  });
});

describe("detectFriction — complaints go to a person, never to the bot", () => {
  it.each([
    "יש לי בעיה עם הבגדים שקיבלתי מכם",
    "הבנתי מהשליח שלי שגם חלק מהקפוצ׳ונים יצאו לא טוב מההדפסה",
    "וזה לא מה שביקשתי ! זה dtf וביקשתי סובלימציה",
    "ההדפס מתקלף אחרי כביסה אחת",
    "אני רוצה לבטל את ההזמנה",
    "יש בעיה במידה של ה m יצא קטן",
    "הי היתה טעות בהזמנה - היה צריך לעשות קפוצ׳ון פליז",
    "עברתי על ההזמנה שאספתי אתמול וחסר לי גם קפוצ׳ון L אחד",
    "יש לי סווצ'ר נוסף עם בעיה זהה",
    "ואז הדפסת 150 חולצות בצבע דהוי",
    "אבל זה לא מה שסיכמנו. אתה הבטחת שתעדכן",
    "אני רואה שבטעות חייבתי פעמיים",
    "אחרת ההזמנה לא רלוונטית לי ואיאלץ לבטל",
  ])("%s", (text) => {
    expect(detectFriction(text).complaint).toBe(true);
  });

  it.each([
    "אין בעיה תודה רבה 🙏",
    "אין לי בעיה אבל העברתי את המחיר של החולצות",
    "אם יש בעיה עם השמות שזה ארוך מדי או משהו רק תגידו לי",
    "ואת זה אפשר לבטל?",
    "אל תוסיף שמתי בטעות עוד m",
    "בוקר טוב אדוני, יש חדש? הם כבר יצאו לטיול",
  ])("ordinary order talk is not a complaint: %s", (text) => {
    expect(detectFriction(text).complaint).toBe(false);
  });
});

describe("detectFriction — anger and 'you are a robot'", () => {
  it("hard signals hand off on their own", () => {
    for (const t of [
      "אוי, בוט מעצבן!! איזה גודל הדגל?",
      "תפסיקו לשלוח את ההודעות האוטומטיות האלה. פשוט בושה וחוצפה",
      "והמענה האוטומטי הזה סתם מעצבן",
      "צריכה תשובה אתם מורחים אותי מהבוקר",
      "אני לא מבינה מה נסגר איתכם כבר סיכמנו את כל ההזמנה בטלפון",
    ]) {
      expect(detectFriction(t).hard).toBe(true);
    }
  });

  it("soft signals are only counted, they don't decide alone", () => {
    for (const t of ["??", "????", "לא הבנתי סליחה!", "זה בוט?", "חחחח רובוט לא מפותח", "כבר כתבתי לך את זה", "זה בן אדם או צאט?", "אני עם נציג דיגיטלי או אנושי?", "זה נציג אנושי?"]) {
      const f = detectFriction(t);
      expect(f.hard).toBe(false);
      expect(f.score).toBeGreaterThanOrEqual(1);
    }
  });

  it("does not fire on product names and normal words that contain trigger letters", () => {
    // 'כובע טמבל' is a hat model; 'אחראי' contains the letters of a swear word.
    expect(detectFriction("היי מה העלות של כובע טמבל עם הדפסה? ובאיזה צבעים יש?").score).toBe(0);
    expect(detectFriction("אני מבקשת שמישהו שאחראי על ההדפסות יבדוק את הקובץ").hard).toBe(false);
    expect(detectFriction("אפשר לבטל את הכיתוב בגב?").complaint).toBe(false);
    expect(detectFriction("32").score).toBe(0);
  });
});

describe("decideFriction — what the bot does with this message", () => {
  it("a normal order message continues to the agent", () => {
    expect(decideFriction({ text: "20 חולצות שחורות דרייפיט", history: [], now: NOW })).toMatchObject({ action: "continue" });
  });

  it("asking for a person hands off immediately — nothing to the customer, an alert to Asi", () => {
    const d = decideFriction({ text: "אפשר לדבר עם נציג?", history: [], now: NOW, businessOpen: true });
    expect(d.action).toBe("handoff");
    expect(d.reason).toBe("wants_human");
    expect(d.reply).toBeNull(); // a bot line doesn't calm anyone; Asi's answer does
    expect(d.notifyGroup).toBe(true);
  });

  it.each([
    ["אפשר לקבל הנחה?", "discount"],
    ["תוריד לי במחיר ואני סוגר עכשיו", "discount"],
    ["יש מצב ליותר זול?", "discount"],
  ])("only Asi decides on price: %s → %s", (text, reason) => {
    expect(decideFriction({ text, history: [], now: NOW })).toMatchObject({ action: "handoff", reason, reply: null });
  });

  it("'what's happening with my order' goes to Asi when the chat has an order", () => {
    for (const text of ["יש עדכון?", "מה עם ההזמנה?", "מתי זה יהיה מוכן?", "מוכן?", "מתי אפשר לאסוף?"]) {
      expect(decideFriction({ text, history: [], now: NOW, hasOrder: true })).toMatchObject({ action: "handoff", reason: "order_status" });
    }
  });

  it("…but a lead asking how long production takes is the bot's to answer", () => {
    expect(decideFriction({ text: "מתי זה יהיה מוכן אם אני מזמין היום?", history: [], now: NOW, hasOrder: false }).action).toBe("continue");
  });

  it("'is this a bot?' gets one honest line, and the chat goes to Asi", () => {
    for (const text of ["זה בוט?", "אני מדבר עם בוט?", "האם את/ה בן אדם או בוט?", "אני עם נציג דיגיטלי או אנושי?"]) {
      const d = decideFriction({ text, history: [], now: NOW });
      expect(d).toMatchObject({ action: "handoff", reason: "asks_if_bot", notifyGroup: true });
      expect(d.reply).toMatch(/בוט/); // never pretends to be a person
    }
  });

  it("calling it a robot in passing is not the sincere question", () => {
    expect(decideFriction({ text: "חחחח רובוט לא מפותח", history: [], now: NOW }).reason).not.toBe("asks_if_bot");
  });

  it("one '??' alone does not hand off", () => {
    expect(decideFriction({ text: "??", history: [b("איזה צבע?"), u("שחור")], now: NOW }).action).toBe("continue");
  });

  it("a second soft signal within the recent turns hands off", () => {
    const history = [u("לא הבנתי", 20), b("כמה יחידות תרצה?", 19)];
    expect(decideFriction({ text: "??", history, now: NOW })).toMatchObject({ action: "handoff", reason: "frustrated" });
  });

  it("an old soft signal (hours ago) does not count", () => {
    const history = [u("לא הבנתי", 600), b("כמה יחידות תרצה?", 599)];
    expect(decideFriction({ text: "??", history, now: NOW }).action).toBe("continue");
  });

  it("breaks the loop: the bot asked the same question twice → hand off instead of a third time", () => {
    // real: "32" → "מה הכמות לתיקי הבד?" → "32" → "כמה תיקי בד תרצי?" → "חחחח רובוט לא מפותח"
    const history = [b("כמה יחידות תרצה?", 6), u("32", 5), b("כמה יחידות תרצה?", 4)];
    expect(decideFriction({ text: "32", history, now: NOW })).toMatchObject({ action: "handoff", reason: "bot_loop" });
  });

  it("while a handoff is pending, the bot stays silent instead of repeating 'קיבלנו את הפנייה'", () => {
    const history = [u("אפשר נציג", 30), b("קיבלנו את הפנייה 🙏 נציג יחזור אליך ברגעים הקרובים.", 29)];
    const d = decideFriction({ text: "הלו?", history, now: NOW });
    expect(d.action).toBe("hold");
    expect(d.reply).toBeNull();
  });

  it("a pending handoff that a human already answered is no longer pending", () => {
    const history = [b("קיבלנו את הפנייה 🙏 נציג יחזור אליך ברגעים הקרובים.", 60), a("היי", 50), u("תודה", 40), b("בשמחה 🙏", 39)];
    expect(decideFriction({ text: "עוד שאלה, יש גם כובעים?", history, now: NOW }).action).toBe("continue");
  });

  it("while holding, the group is re-alerted only when the customer is getting upset", () => {
    const history = [b("קיבלנו את הפנייה 🙏 נציג יחזור אליך ברגעים הקרובים.", 30)];
    expect(decideFriction({ text: "תודה", history, now: NOW }).notifyGroup).toBe(false);
    expect(decideFriction({ text: "למה אף אחד לא עונה???", history, now: NOW }).notifyGroup).toBe(true);
  });

  it("garbage history does not throw", () => {
    expect(() => decideFriction({ text: "שלום", history: [null, {}, { role: "bot" }] as never, now: NOW })).not.toThrow();
  });
});

describe("historyBefore — the current turn is never its own history", () => {
  it("sorts oldest-first and drops the customer rows that make up the current merged turn", () => {
    const rows = [
      { role: "user", text: "הלו?", created_at: ago(1) },
      { role: "bot", text: "כמה יחידות תרצה?", created_at: ago(4) },
      { role: "user", text: "??", created_at: ago(2) },
      { role: "user", text: "20", created_at: ago(5) },
    ];
    const h = historyBefore(rows, "??\nהלו?\n[המערכת: עכשיו יום שלישי, השעה 12:00. העסק פתוח כרגע.]");
    expect(h.map((x) => x.text)).toEqual(["20", "כמה יחידות תרצה?"]);
  });

  it("keeps only the last N rows and survives junk", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ role: "bot", text: `m${i}`, created_at: ago(100 - i) }));
    expect(historyBefore([...rows, null, { role: 1 }] as never, "x", 12)).toHaveLength(12);
    expect(historyBefore(undefined as never, "x")).toEqual([]);
  });
});

describe("isRepeat — last line of defence before sending", () => {
  it("blocks an identical resend", () => {
    expect(isRepeat("כמה יחידות תרצה?", "כמה יחידות תרצה?")).toBe(true);
    expect(isRepeat("כמה יחידות תרצה? 🙂", "כמה יחידות תרצה?")).toBe(true);
  });
  it("lets a changed order summary through", () => {
    const s1 = "הנה סיכום ההזמנה: • עיצוב 1: חולצה כותנה שרוול קצר — לבן 10 יח' | מידות: 5M, 5L";
    const s2 = "הנה סיכום ההזמנה: • עיצוב 1: חולצה כותנה שרוול קצר — שחור 12 יח' | מידות: 6M, 6L";
    expect(isRepeat(s2, s1)).toBe(false);
  });
  it("empty inputs are never a repeat", () => {
    expect(isRepeat("", "")).toBe(false);
    expect(isRepeat("שלום", null)).toBe(false);
  });
});

describe("repeatGuard — what Repeat Guard does with the agent's reply", () => {
  it("blocks a verbatim repeat — nothing is sent, Asi is alerted instead", () => {
    const g = repeatGuard({ reply: "כמה יחידות תרצה? 🙂", isOrder: false, lastBotText: "כמה יחידות תרצה?" });
    expect(g.blocked).toBe(true);
    expect(g.reply).toBeNull();
  });
  it("never blocks an order summary — that send releases the payment link", () => {
    const s = "הנה סיכום ההזמנה: • עיצוב 1: חולצה כותנה שרוול קצר — לבן 10 יח'";
    expect(repeatGuard({ reply: s, isOrder: true, lastBotText: s }).blocked).toBe(false);
  });
  it("lets a new message through", () => {
    expect(repeatGuard({ reply: "איזה צבע?", isOrder: false, lastBotText: "כמה יחידות תרצה?" })).toEqual({ blocked: false, reply: null });
  });
});

describe("isShopOpen — reminders only while T-Center is open", () => {
  // 2026-11-24 is a Tuesday; Israel is UTC+2 in November.
  it.each([
    ["2026-11-24T08:00:00Z", true],   // Tue 10:00
    ["2026-11-24T06:00:00Z", false],  // Tue 08:00, before 08:30
    ["2026-11-24T14:45:00Z", false],  // Tue 16:45, after 16:30
    ["2026-11-27T11:00:00Z", true],   // Fri 13:00
    ["2026-11-27T12:30:00Z", false],  // Fri 14:30, after 14:00
    ["2026-11-28T09:00:00Z", false],  // Saturday
  ])("%s → %s", (iso, open) => {
    expect(isShopOpen(new Date(iso))).toBe(open);
  });
});

describe("groupAlert / reminderAlert", () => {
  it("names the reason in Asi's terms", () => {
    expect(groupAlert({ reason: "discount", name: "דנה", phone: "972501234567", lastText: "יש הנחה?" })).toMatch(/הנחה/);
    expect(groupAlert({ reason: "order_status", name: "דנה", phone: "972501234567", lastText: "יש עדכון?" })).toMatch(/ההזמנה/);
  });
  it("a reminder says how long the customer has been waiting", () => {
    const r = reminderAlert({ reason: "wants_human", name: "דנה", phone: "972501234567", lastText: "אפשר נציג?", waitedMin: 17 });
    expect(r).toMatch(/תזכורת/);
    expect(r).toContain("17");
    expect(r).toContain("https://wa.me/972501234567");
  });
  it("group alert carries the reason, the customer's words and a chat link", () => {
    const g = groupAlert({ reason: "frustrated", name: "דנה", phone: "972501234567", lastText: "בוט מעצבן" });
    expect(g).toContain("דנה");
    expect(g).toContain("בוט מעצבן");
    expect(g).toContain("https://wa.me/972501234567");
    expect(g).toMatch(/הבוט הושתק/);
  });
});
