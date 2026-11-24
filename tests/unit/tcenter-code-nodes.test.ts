import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildNodes, OUT_DIR } from "../../scripts/n8n/build-tcenter-nodes.mjs";

type Json = Record<string, unknown>;
const built: Record<string, string> = buildNodes();

/** Run a generated Code node the way n8n does: a function body with $, $input, $getWorkflowStaticData. */
function runNode(file: string, opts: { nodes: Record<string, Json>; input?: Json[]; staticData?: Json }) {
  const wrap = (arr: Json[]) => arr.map((json) => ({ json }));
  const $ = (name: string) => {
    if (!(name in opts.nodes)) throw new Error(`Referenced node doesn't exist: ${name}`);
    const items = wrap([opts.nodes[name]]);
    return { first: () => items[0], all: () => items, item: items[0] };
  };
  const input = wrap(opts.input ?? [{}]);
  const $input = { all: () => input, first: () => input[0] };
  const staticData = opts.staticData ?? {};
  const fn = new Function("$", "$input", "$getWorkflowStaticData", built[file]);
  return fn($, $input, () => staticData) as Array<{ json: Json }>;
}

const webhook = (m: Json) => ({ "Webhook (WHAPI In)": { body: { messages: [m] } } });
const CHAT = "972501234567@s.whatsapp.net";

describe("generated n8n Code nodes", () => {
  it("the committed files are exactly what the build produces (no hand edits, no stale copies)", () => {
    for (const [file, code] of Object.entries(built)) {
      expect(readFileSync(join(OUT_DIR, file), "utf8"), `${file} is stale — run node scripts/n8n/build-tcenter-nodes.mjs`).toBe(code);
    }
  });

  describe("classify-takeover.js", () => {
    it("owner says the order is ready → quiet until midnight", () => {
      const out = runNode("classify-takeover.js", {
        nodes: webhook({ from_me: true, source: "mobile", type: "text", text: { body: "ההזמנה מוכנה" }, chat_id: CHAT }),
      });
      expect(out).toHaveLength(1);
      expect(out[0].json).toMatchObject({ chatId: CHAT, active: true, takeoverKind: "close" });
    });

    it("owner sends '🤖' → bot back on", () => {
      const out = runNode("classify-takeover.js", {
        nodes: webhook({ from_me: true, source: "mobile", type: "text", text: { body: "🤖" }, chat_id: CHAT }),
      });
      expect(out[0].json).toMatchObject({ active: false, takeoverKind: "release" });
    });

    it("the bot's own send produces no item (nothing is written)", () => {
      const out = runNode("classify-takeover.js", {
        nodes: webhook({ from_me: true, source: "api", type: "text", text: { body: "ההזמנה מוכנה" }, chat_id: CHAT }),
      });
      expect(out).toEqual([]);
    });

    it("reads the current row from its input and never shortens a running silence", () => {
      const midnight = new Date(Date.now() + 20 * 3600000).toISOString();
      const out = runNode("classify-takeover.js", {
        nodes: webhook({ from_me: true, source: "mobile", type: "sticker", chat_id: CHAT }),
        input: [{ chat_id: CHAT, active: true, silenced_until: midnight }],
      });
      expect(out[0].json.silencedUntil).toBe(midnight);
    });
  });

  describe("friction-gate.js", () => {
    const turn = (mergedText: string) => ({
      "Bot Allowed?": { chatId: CHAT, senderName: "דנה", mergedText: `${mergedText}\n[המערכת: עכשיו יום שלישי, השעה 10:00. העסק פתוח כרגע.]`, businessOpen: true },
    });

    it("a request for a person → handoff: nothing to the customer, alert + silence + a row to remember it", () => {
      const out = runNode("friction-gate.js", { nodes: turn("אפשר לדבר עם נציג?"), input: [{}] });
      const j = out[0].json;
      expect(j.frictionAction).toBe("handoff");
      expect(j.frictionReason).toBe("wants_human");
      expect(j.frictionReply).toBeNull();
      expect(String(j.frictionAlert)).toContain("https://wa.me/972501234567");
      expect(new Date(String(j.silencedUntil)).getTime()).toBeGreaterThan(Date.now());
      expect(j.handoffRow).toMatchObject({ chat_id: CHAT, reason: "wants_human", last_text: "אפשר לדבר עם נציג?" });
      expect(j.chatId).toBe(CHAT); // the turn passes through for the agent branch
    });

    it("'מתי מוכן?' goes to Asi only when the Load Orders node found an order", () => {
      const withOrder = runNode("friction-gate.js", {
        nodes: { ...turn("מתי זה יהיה מוכן?"), "Friction: Load Orders": { chat_id: CHAT, status: "paid" } },
        input: [{}],
      });
      expect(withOrder[0].json).toMatchObject({ frictionAction: "handoff", frictionReason: "order_status" });
      const lead = runNode("friction-gate.js", { nodes: { ...turn("מתי זה יהיה מוכן?"), "Friction: Load Orders": {} }, input: [{}] });
      expect(lead[0].json.frictionAction).toBe("continue");
      // the node is optional: without it the gate still runs
      expect(runNode("friction-gate.js", { nodes: turn("מתי זה יהיה מוכן?"), input: [{}] })[0].json.frictionAction).toBe("continue");
    });

    it("'זה בוט?' → the one honest line is the only reply", () => {
      const out = runNode("friction-gate.js", { nodes: turn("זה בוט?"), input: [{}] });
      expect(out[0].json).toMatchObject({ frictionAction: "handoff", frictionReason: "asks_if_bot" });
      expect(String(out[0].json.frictionReply)).toMatch(/בוט/);
    });

    it("a normal message → continue, and exposes the last bot line for Repeat Guard", () => {
      const rows = [{ role: "bot", text: "כמה יחידות תרצה?", created_at: new Date(Date.now() - 60000).toISOString() }];
      const out = runNode("friction-gate.js", { nodes: turn("20 חולצות"), input: rows });
      expect(out[0].json).toMatchObject({ frictionAction: "continue", lastBotText: "כמה יחידות תרצה?" });
    });

    it("pending handoff → hold; the group is re-alerted once per 30 minutes, not on every message", () => {
      const rows = [{ role: "bot", text: "קיבלנו את הפנייה 🙏 נציג יחזור אליך ברגעים הקרובים.", created_at: new Date(Date.now() - 10 * 60000).toISOString() }];
      const staticData = {};
      const first = runNode("friction-gate.js", { nodes: turn("למה אף אחד לא עונה???"), input: rows, staticData });
      const second = runNode("friction-gate.js", { nodes: turn("הלו??"), input: rows, staticData });
      expect(first[0].json).toMatchObject({ frictionAction: "hold", frictionReply: null, frictionNotify: true });
      expect(second[0].json).toMatchObject({ frictionAction: "hold", frictionNotify: false });
    });
  });

  describe("repeat-guard.js", () => {
    const gate = { "Friction Gate": { lastBotText: "כמה יחידות תרצה?", businessOpen: true, mergedText: "32" } };

    it("a verbatim repeat becomes a silent handoff", () => {
      const out = runNode("repeat-guard.js", { nodes: gate, input: [{ chatId: CHAT, senderName: "דנה", summary: "כמה יחידות תרצה? 🙂", isOrder: false }] });
      expect(out[0].json).toMatchObject({ repeatBlocked: true, frictionAction: "handoff", frictionReason: "bot_loop", frictionReply: null });
      expect(out[0].json.handoffRow).toMatchObject({ chat_id: CHAT, reason: "bot_loop" });
    });

    it("anything else passes through untouched", () => {
      const out = runNode("repeat-guard.js", { nodes: gate, input: [{ chatId: CHAT, summary: "איזה צבע?", isOrder: false }] });
      expect(out[0].json).toMatchObject({ repeatBlocked: false, summary: "איזה צבע?" });
    });
  });

  describe("handoff-reminder.js", () => {
    const due = [
      { id: 7, chat_id: CHAT, reason: "discount", name: "דנה", last_text: "יש הנחה?", alerted_at: new Date(Date.now() - 20 * 60000).toISOString() },
      { foo: 1 },
    ];

    it("turns each due handoff into one reminder line (only while the shop is open)", () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date("2026-11-24T08:00:00Z")); // Tue 10:00 Israel
        const fresh = [{ ...due[0], alerted_at: new Date(Date.now() - 20 * 60000).toISOString() }, due[1]];
        const out = runNode("handoff-reminder.js", { nodes: {}, input: fresh });
        expect(out).toHaveLength(1);
        expect(out[0].json.id).toBe(7);
        expect(String(out[0].json.groupText)).toMatch(/תזכורת/);
        expect(String(out[0].json.groupText)).toContain("20");

        vi.setSystemTime(new Date("2026-11-28T09:00:00Z")); // Saturday
        expect(runNode("handoff-reminder.js", { nodes: {}, input: fresh })).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("group-bot-command.js", () => {
    const card = "⚠️ ביקש/ה לדבר עם נציג — הבוט הושתק בשיחה הזו\n\nשם: דנה\nטלפון: +972501234567\nפתיחת צ'אט: https://wa.me/972501234567";
    const groupMsg = (body: string) =>
      webhook({ from_me: true, source: "mobile", type: "text", text: { body }, chat_id: "120363000000000000@g.us", context: { quoted_content: { body: card } } });

    it("'בוט' as a reply to an alert card releases that customer", () => {
      const out = runNode("group-bot-command.js", { nodes: groupMsg("בוט") });
      expect(out[0].json).toMatchObject({ chatId: CHAT, active: false });
    });

    it("'שקט' silences that customer until midnight", () => {
      const out = runNode("group-bot-command.js", { nodes: groupMsg("שקט") });
      expect(out[0].json).toMatchObject({ chatId: CHAT, active: true });
    });

    it("ordinary group chatter does nothing", () => {
      expect(runNode("group-bot-command.js", { nodes: groupMsg("מי לוקח את ההזמנה של דנה?") })).toEqual([]);
    });
  });
});
