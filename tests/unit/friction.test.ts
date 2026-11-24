import { describe, it, expect } from "vitest";
// plain .mjs, shared verbatim with the n8n Code node ("Friction Gate")
import {
  cleanCustomerText,
  detectFriction,
  decideFriction,
  isRepeat,
  handoffReply,
  groupAlert,
  historyBefore,
  repeatGuard,
  lastBotLine,
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
    // false positives found by the 45-day replay: pre-sale "חסר לי", and questions
    "סמול- 13 מדיום- 7 לארג- 7 עדיין חסר לי שתי מידות , אשלח בקרוב:)",
    "היי חסר לי גיליון אחד אני יכולה לשלוח לך ותדפיס לי עד 16:30?",
    "חסרים לי עוד 6 הורים שלא שילמו",
    "כרגע עוד בשלב בירורים, לא אוכל לסגור הזמנה כרגע, כי עוד חסרות לי מידות מאנשים",
    "ההדפס לא מתקלף בכביסה נכון?",
    "זה טוב אבל? לא יצא מטושטש?",
    "אם החולצה תגיע באיכות לא טובה, יהיה לי אפשרות לקבל החזר כספי?",
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

  it("asking for a person hands off immediately, with one honest reply", () => {
    const d = decideFriction({ text: "אפשר לדבר עם נציג?", history: [], now: NOW, businessOpen: true });
    expect(d.action).toBe("handoff");
    expect(d.reason).toBe("wants_human");
    expect(d.reply).toBeTruthy();
    expect(d.reply).not.toMatch(/ברגעים הקרובים/); // that promise was broken in half the chats
    expect(d.notifyGroup).toBe(true);
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

  it("a re-asked question is NOT a loop to hand off (replay: 176 such handoffs, nearly all normal selling)", () => {
    const history = [b("כמה יחידות תרצה?", 6), u("32", 5), b("כמה יחידות תרצה?", 4)];
    expect(decideFriction({ text: "32", history, now: NOW }).action).toBe("continue");
    // ...including the "כן" that approves an order summary
    const s = "הנה סיכום ההזמנה: • עיצוב 1: חולצה כותנה — ורוד 35 יח'";
    expect(decideFriction({ text: "כן", history: [b(s, 6), u("רגע", 5), b(s, 4)], now: NOW }).action).toBe("continue");
  });

  it("after a handoff promise the bot keeps answering (replay: a silent hold would have muted ~1,800 real answers)", () => {
    const history = [u("כמה עולים גרביים?", 30), b("על המוצר הזה המחיר נקבע מול הצוות 🙏 נציג יחזור אליך עם מחיר מדויק בהקדם.", 29)];
    expect(decideFriction({ text: "ו-20 חולצות כותנה שחורות?", history, now: NOW }).action).toBe("continue");
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

describe("repeatGuard — the handoff promise is never sent twice in a row", () => {
  const OPEN = "קיבלנו את הפנייה 🙏 נציג יחזור אליך ברגעים הקרובים.";
  const CLOSED = "קיבלנו את הפנייה 🙏 כרגע אנחנו מחוץ לשעות הפעילות, ונציג יחזור אליך כאן בוואטסאפ עם פתיחת שעות הפעילות הקרובות";
  it("blocks the canned line when it was the bot's last line and no human answered since", () => {
    expect(repeatGuard({ reply: OPEN, isOrder: false, history: [u("אפשר נציג", 30), b(OPEN, 29)], now: NOW }).blocked).toBe(true);
    expect(repeatGuard({ reply: CLOSED, isOrder: false, history: [b(OPEN, 29), u("??", 5)], now: NOW }).blocked).toBe(true);
  });
  it("blocks a near-verbatim handoff line the model wrote itself", () => {
    const line = "העברתי את הבקשה להדמיה לנציג, והוא יחזור אליך כאן עם פתיחת שעות הפעילות הקרובות 🙏";
    expect(repeatGuard({ reply: line, isOrder: false, history: [b(line, 3)], now: NOW }).blocked).toBe(true);
  });
  it("a human in between, or a promise older than holdHours, lets it go out", () => {
    expect(repeatGuard({ reply: OPEN, isOrder: false, history: [b(OPEN, 30), a("היי", 20)], now: NOW }).blocked).toBe(false);
    expect(repeatGuard({ reply: OPEN, isOrder: false, history: [b(OPEN, 13 * 60)], now: NOW }).blocked).toBe(false);
  });
  it("never blocks a non-handoff reply, even a verbatim re-asked question", () => {
    expect(repeatGuard({ reply: "כמה יחידות תרצה? 🙂", isOrder: false, history: [b("כמה יחידות תרצה?", 2)], now: NOW }).blocked).toBe(false);
  });
  it("a handoff line after a sales line goes out (first promise)", () => {
    expect(repeatGuard({ reply: OPEN, isOrder: false, history: [b("איזה צבע?", 2)], now: NOW }).blocked).toBe(false);
  });
  it("never blocks an order summary — that send releases the payment link", () => {
    const s = "הנה סיכום ההזמנה: • עיצוב 1: חולצה כותנה שרוול קצר — לבן 10 יח' — נציג יחזור אליך";
    expect(repeatGuard({ reply: s, isOrder: true, history: [b(s, 2)], now: NOW }).blocked).toBe(false);
  });
  it("lastBotLine is null once a human spoke after the bot", () => {
    expect(lastBotLine([b("x", 3), a("y", 2), u("z", 1)])).toBeNull();
    expect(lastBotLine([a("y", 3), b("x", 2), u("z", 1)])?.text).toBe("x");
    expect(lastBotLine(undefined as never)).toBeNull();
  });
});

describe("handoffReply / groupAlert", () => {
  it("is honest about business hours", () => {
    expect(handoffReply("wants_human", false)).toMatch(/שעות הפעילות/);
    expect(handoffReply("wants_human", true)).not.toMatch(/שעות הפעילות/);
  });
  it("apologises when the customer is upset", () => {
    expect(handoffReply("frustrated", true)).toMatch(/מצטער/);
  });
  it("group alert carries the reason, the customer's words and a chat link", () => {
    const g = groupAlert({ reason: "frustrated", name: "דנה", phone: "972501234567", lastText: "בוט מעצבן" });
    expect(g).toContain("דנה");
    expect(g).toContain("בוט מעצבן");
    expect(g).toContain("https://wa.me/972501234567");
    expect(g).toMatch(/הבוט הושתק/);
  });
  it("a 'still waiting' card does not claim the bot was silenced or offer to bring it back", () => {
    const g = groupAlert({ reason: "still_waiting", name: "דנה", phone: "972501234567", lastText: "??", silenced: false });
    expect(g).toContain("עדיין מחכה לנציג");
    expect(g).not.toMatch(/הושתק|השיבו/);
  });
});
