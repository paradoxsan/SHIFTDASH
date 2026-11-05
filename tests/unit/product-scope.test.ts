import { describe, it, expect } from "vitest";
// plain .mjs, inlined verbatim into the T-CENTER "Parse Order" Code node
import { movementShirtGuard, MOVEMENT_SHIRT_REPLY } from "../../lib/bot/product-scope.mjs";

// The system note "Bot Allowed?" appends to every customer batch.
const NOTE = "\n[המערכת: עכשיו יום רביעי, השעה 00:02. העסק סגור כרגע (מחוץ לשעות הפעילות).]";

describe("movementShirtGuard — the 2026-11-05 conversation (972555519953)", () => {
  it("overrides the first false yes", () => {
    const r = movementShirtGuard({
      incoming: "הייי רציתי לדעת אם אתם מדפיסים חולצות תנועה של בני עקיבא \nמה עלות כל חולצה וכמה עולה משלוח?" + NOTE,
      reply: "היי\nכן, אנחנו מדפיסים על חולצות תנועה.\nאיזה סוג חולצות וכמה יחידות תרצה?",
    });
    expect(r.override).toBe(true);
    expect(r.text).toBe(MOVEMENT_SHIRT_REPLY);
  });

  it("overrides the second false yes, after 'you didn't understand'", () => {
    const r = movementShirtGuard({
      incoming: "אני לא חושבת שהבנת \nאני לא רוצה חולצה רגילה, אני רוצה חולצות של צוות בני עקיבא\nאתם מייצרים כאלה?" + NOTE,
      reply: "כן, אנחנו מדפיסים על חולצות תנועה של בני עקיבא. אנחנו מספקים את החולצות ועליהן מדפיסים את הסמל או העיצוב שלכם.\nכמה חולצות תרצה?",
    });
    expect(r.override).toBe(true);
  });

  it("leaves a plain t-shirt quote alone", () => {
    const r = movementShirtGuard({
      incoming: "35" + NOTE,
      reply: "35 חולצות טריקו כותנה שרוול קצר — 20 ₪ ליחידה, סה\"כ 700 ₪.\nרוצה שנתקדם להזמנה?",
    });
    expect(r.override).toBe(false);
  });
});

describe("movementShirtGuard — honest answers pass", () => {
  it("passes a reply that already says we don't have them", () => {
    const r = movementShirtGuard({
      incoming: "יש לכם חולצות תנועה?",
      reply: "אין לנו חולצות תנועה. יש לנו טריקו כותנה ודרייפיט שאפשר להדפיס עליהן.",
    });
    expect(r.override).toBe(false);
  });

  it("passes 'we don't make movement shirts' (negation right before the term)", () => {
    const r = movementShirtGuard({
      incoming: "אתם עושים חולצות בני עקיבא?",
      reply: "אנחנו לא מייצרים חולצות תנועה, אבל אפשר להדפיס על טריקו רגילה.",
    });
    expect(r.override).toBe(false);
  });

  it("does not loop on its own canned reply", () => {
    const r = movementShirtGuard({ incoming: "חולצות תנועה?", reply: MOVEMENT_SHIRT_REPLY });
    expect(r.override).toBe(false);
  });
});

describe("movementShirtGuard — evasions and other movements", () => {
  it("overrides an evasive answer that never says no", () => {
    const r = movementShirtGuard({
      incoming: "יש לכם חולצות תנועה?",
      reply: "יש לנו חולצות טריקו כותנה רגילות וחולצות דרייפיט נושמות.",
    });
    expect(r.override).toBe(true);
  });

  it.each([
    ["חולצות צופים", "כן, יש לנו חולצות צופים בכל המידות."],
    ["חולצת השומר הצעיר", "בטח, חולצת השומר הצעיר עולה 20 ₪."],
    ["חולצות בני המושבים", "כן, מדפיסים חולצות בני המושבים."],
  ])("catches %s", (asked, reply) => {
    expect(movementShirtGuard({ incoming: `צריכה ${asked} לסניף`, reply }).override).toBe(true);
  });

  it("reads 'אין בעיה' as a yes, not a no", () => {
    const r = movementShirtGuard({ incoming: "אפשר?", reply: "אין בעיה, נכין לכם חולצות תנועה." });
    expect(r.override).toBe(true);
  });

  it("does not let a 'no' in an earlier sentence hide a later yes", () => {
    const r = movementShirtGuard({ incoming: "מה יש?", reply: "אין לנו פולו. כן, יש לנו חולצות תנועה." });
    expect(r.override).toBe(true);
  });

  it("catches the bot volunteering a movement shirt the customer never named", () => {
    const r = movementShirtGuard({
      incoming: "[המערכת: הלקוח שלח תמונה/קובץ בלי טקסט.]",
      reply: "מעולה, זו חולצת תנועה — כמה יחידות?",
    });
    expect(r.override).toBe(true);
  });
});

describe("movementShirtGuard — a movement as the CUSTOMER, not the product", () => {
  it("does not block a normal printed-shirt order for a movement branch", () => {
    const r = movementShirtGuard({
      incoming: "צריכה 30 חולצות לטיול השנתי של הסניף שלנו בבני עקיבא עם הדפס",
      reply: "בשמחה! טריקו כותנה שרוול קצר — 20 ₪ ליחידה. איזה צבע?",
    });
    expect(r.override).toBe(false);
  });

  it("is safe on empty input", () => {
    expect(movementShirtGuard({}).override).toBe(false);
    expect(movementShirtGuard({ incoming: null, reply: undefined }).override).toBe(false);
  });
});
