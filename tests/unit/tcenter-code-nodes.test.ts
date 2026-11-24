import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildNodes, OUT_DIR } from "../../scripts/n8n/build-tcenter-nodes.mjs";

type Json = Record<string, unknown>;
const built: Record<string, string> = buildNodes();

/** Run a generated Code node the way n8n does: a function body with $, $input, $getWorkflowStaticData. */
function runNode(file: string, opts: { nodes: Record<string, Json | Json[]>; input?: Json[]; staticData?: Json }) {
  const wrap = (arr: Json[]) => arr.map((json) => ({ json }));
  const $ = (name: string) => {
    if (!(name in opts.nodes)) throw new Error(`Referenced node doesn't exist: ${name}`);
    const v = opts.nodes[name];
    const items = wrap(Array.isArray(v) ? v : [v]); // an array = a node that emitted several items
    return { first: () => items[0], all: () => items, item: items[0] };
  };
  const input = wrap(opts.input ?? [{}]);
  const $input = { all: () => input, first: () => input[0] };
  const staticData = opts.staticData ?? {};
  const fn = new Function("$", "$input", "$getWorkflowStaticData", built[file]);
  return fn($, $input, () => staticData) as Array<{ json: Json; pairedItem?: unknown }>;
}

const webhook = (m: Json) => ({ "Webhook (WHAPI In)": { body: { messages: [m] } } });
const CHAT = "972501234567@s.whatsapp.net";
const minAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();

/** "Bot Allowed?" + "Mem: Load History" as the live bot has them when the agent branch runs. */
const turn = (mergedText: string, history: Json[] = [{}]) => ({
  "Bot Allowed?": {
    chatId: CHAT, senderName: "דנה", businessOpen: true, turnKey: "tcbuf-7", rawText: mergedText,
    mergedText: `${mergedText}\n[המערכת: עכשיו יום שלישי, השעה 10:00. העסק פתוח כרגע.]`,
  },
  "Mem: Load History": history, // Always Output Data ON: no rows = one empty item
});

describe("generated n8n Code nodes", () => {
  it("the committed files are exactly what the build produces (no hand edits, no stale copies)", () => {
    for (const [file, code] of Object.entries(built)) {
      // Line endings aside: a Windows checkout (core.autocrlf) rewrites the committed copies to CRLF.
      const onDisk = readFileSync(join(OUT_DIR, file), "utf8").replace(/\r\n/g, "\n");
      expect(onDisk, `${file} is stale — run node scripts/n8n/build-tcenter-nodes.mjs`).toBe(code.replace(/\r\n/g, "\n"));
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

    it("owner writes anything else → quiet for 2 hours (the owner's setting; Rep: Stamp's 125-min window)", () => {
      const out = runNode("classify-takeover.js", {
        nodes: webhook({ from_me: true, source: "mobile", type: "text", text: { body: "." }, chat_id: CHAT }),
      });
      const mins = (new Date(String(out[0].json.silencedUntil)).getTime() - Date.now()) / 60000;
      expect(out[0].json.takeoverKind).toBe("handling");
      expect(mins).toBeGreaterThan(119);
      expect(mins).toBeLessThanOrEqual(125);
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
    it("a request for a person → handoff with reply, alert, silence window and the turn to save", () => {
      const out = runNode("friction-gate.js", { nodes: turn("אפשר לדבר עם נציג?"), input: [{ agentText: "AGENT" }] });
      const j = out[0].json;
      expect(j.frictionAction).toBe("handoff");
      expect(j.frictionReason).toBe("wants_human");
      expect(String(j.frictionReply)).toMatch(/העברתי את השיחה לצוות/);
      expect(String(j.frictionAlert)).toContain("https://wa.me/972501234567");
      expect(new Date(String(j.frictionSilencedUntil)).getTime()).toBeGreaterThan(Date.now() + 11 * 3600000);
      expect(j).toMatchObject({ frictionChatId: CHAT, frictionMemUser: "אפשר לדבר עם נציג?", frictionTurnKey: "tcbuf-7" });
      expect(j.agentText).toBe("AGENT"); // its input (Draft: Context via Language Gate) passes through
      expect(out[0]).toMatchObject({ pairedItem: { item: 0 } });
    });

    it("a normal message → continue, no alert", () => {
      const out = runNode("friction-gate.js", { nodes: turn("20 חולצות", [{ role: "bot", text: "כמה יחידות תרצה?", created_at: minAgo(1) }]) });
      expect(out[0].json).toMatchObject({ frictionAction: "continue", frictionAlert: null, frictionReply: null });
    });

    it("the customer repeating the same soft signal counts twice (history already excludes this turn)", () => {
      const out = runNode("friction-gate.js", { nodes: turn("לא הבנתי", [{ role: "user", text: "לא הבנתי", created_at: minAgo(3) }]) });
      expect(out[0].json).toMatchObject({ frictionAction: "handoff", frictionReason: "frustrated" });
    });

    it("after a handoff promise the bot still answers a new question (no silent hold)", () => {
      const rows = [{ role: "bot", text: "קיבלנו את הפנייה 🙏 נציג יחזור אליך ברגעים הקרובים.", created_at: minAgo(10) }];
      const out = runNode("friction-gate.js", { nodes: turn("ומה המחיר ל-20 חולצות?", rows) });
      expect(out[0].json.frictionAction).toBe("continue");
    });
  });

  describe("repeat-guard.js", () => {
    const canned = "קיבלנו את הפנייה 🙏 נציג יחזור אליך ברגעים הקרובים.";

    it("the canned handoff line again, with no human in between → not sent; turn saved; group told once per 30 min", () => {
      const nodes = turn("?", [{ role: "bot", text: canned, created_at: minAgo(5) }]);
      const staticData = {};
      const first = runNode("repeat-guard.js", { nodes, input: [{ chatId: CHAT, summary: canned, isOrder: false }], staticData });
      const second = runNode("repeat-guard.js", { nodes, input: [{ chatId: CHAT, summary: canned, isOrder: false }], staticData });
      expect(first[0].json).toMatchObject({ repeatBlocked: true, chatId: CHAT, rawText: "?", turnKey: "tcbuf-7" });
      expect(String(first[0].json.frictionAlert)).toContain("עדיין מחכה לנציג");
      expect(String(first[0].json.frictionAlert)).not.toContain("הושתק");
      expect(second[0].json).toMatchObject({ repeatBlocked: true, frictionAlert: "" });
    });

    it("a human answered after the promise → the line may go out again", () => {
      const nodes = turn("?", [
        { role: "bot", text: canned, created_at: minAgo(30) },
        { role: "agent", text: "היי, אני בודק", created_at: minAgo(20) },
      ]);
      const out = runNode("repeat-guard.js", { nodes, input: [{ chatId: CHAT, summary: canned, isOrder: false }] });
      expect(out[0].json.repeatBlocked).toBe(false);
    });

    it("a re-asked sales question passes through untouched", () => {
      const nodes = turn("32", [{ role: "bot", text: "כמה יחידות תרצה?", created_at: minAgo(1) }]);
      const out = runNode("repeat-guard.js", { nodes, input: [{ chatId: CHAT, summary: "כמה יחידות תרצה? 🙂", isOrder: false }] });
      expect(out[0].json).toMatchObject({ repeatBlocked: false, summary: "כמה יחידות תרצה? 🙂" });
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

    it("the existing 'Esc: Notify Group' card works too (phone on a '+972' line, no wa.me before it)", () => {
      const esc = "🔔 לקוח מבקש מענה אישי / נציג\n\nסוג הפנייה: מחיר\nשם: דנה\nטלפון: +972501234567\nפתיחת צ'אט עם הלקוח: https://wa.me/972501234567";
      const out = runNode("group-bot-command.js", {
        nodes: webhook({ from_me: true, source: "mobile", type: "text", text: { body: "בוט" }, chat_id: "120363000000000000@g.us", context: { quoted_content: { body: esc } } }),
      });
      expect(out[0].json).toMatchObject({ chatId: CHAT, active: false });
    });
  });
});
