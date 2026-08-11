import { describe, it, expect } from "vitest";
// plain .mjs, shared verbatim with the watchdog's "Evaluate" Code node
import {
  normalizeChatId,
  isGroupChat,
  messagesOf,
  realInbound,
  droppedSummary,
} from "../../lib/bot/inbox-health.mjs";

const ASI = "972569457773@s.whatsapp.net";       // owner's personal number (ignored)
const DANIEL = "972584257154@s.whatsapp.net";    // dashboard test line (ignored)
const CUSTOMER = "972501112222@s.whatsapp.net";
const GROUP = "120363000000000000@g.us";

/** A WHAPI webhook envelope exactly as the receiver stores it. */
const row = (chatId: string, fromMe = false, asString = true) => {
  const envelope = {
    messages: [
      { id: "x", from_me: fromMe, type: "text", source: "mobile", chat_id: chatId },
    ],
  };
  return { chat_id: chatId, payload: asString ? JSON.stringify(envelope) : envelope };
};

describe("normalizeChatId", () => {
  it("compares on digits, so config can hold a bare number", () => {
    expect(normalizeChatId(ASI)).toBe("972569457773");
    expect(normalizeChatId("972569457773")).toBe("972569457773");
    expect(normalizeChatId("+972-56-945-7773")).toBe("972569457773");
    expect(normalizeChatId(null)).toBe("");
    expect(normalizeChatId(undefined)).toBe("");
  });
});

describe("isGroupChat", () => {
  it("recognises a group jid", () => {
    expect(isGroupChat(GROUP)).toBe(true);
    expect(isGroupChat(CUSTOMER)).toBe(false);
  });
});

describe("messagesOf", () => {
  it("parses the T-CENTER shape: a JSON string inside a jsonb column", () => {
    const payload = JSON.stringify(JSON.stringify({ messages: [{ from_me: false, chat_id: CUSTOMER }] }));
    expect(messagesOf(payload)).toHaveLength(1);
  });

  it("parses the BRJewelry shape: plain text", () => {
    expect(messagesOf(JSON.stringify({ messages: [{ from_me: false }] }))).toHaveLength(1);
  });

  it("accepts an already-parsed object", () => {
    expect(messagesOf({ messages: [{ from_me: false }, { from_me: true }] })).toHaveLength(2);
  });

  it("accepts a bare message object", () => {
    expect(messagesOf({ from_me: false, chat_id: CUSTOMER })).toHaveLength(1);
  });

  it("returns nothing for rows that are not webhook envelopes", () => {
    // BRJewelry writes vision records into the same table
    expect(messagesOf('{"image":true,"caption":"","description":"שקיעה בים","vision_ok":true}')).toEqual([]);
    expect(messagesOf("not json at all")).toEqual([]);
    expect(messagesOf(null)).toEqual([]);
    expect(messagesOf(undefined)).toEqual([]);
    expect(messagesOf("")).toEqual([]);
  });
});

describe("realInbound", () => {
  const ignore = ["972584257154", "972569457773"];

  it("replays 2026-08-07: 75 rows from the owner's own chat are zero customers", () => {
    const rows = [
      ...Array.from({ length: 40 }, () => row(ASI, true)),   // Asi answering from the business phone
      ...Array.from({ length: 35 }, () => row(ASI, false)),  // Asi writing in from his personal number
    ];
    const out = realInbound(rows, { ignore });
    expect(out.count).toBe(0);
    expect(out.dropped.fromMe).toBe(40);
    expect(out.dropped.ignored).toBe(35);
  });

  it("still counts a real customer nobody answered", () => {
    const rows = [row(CUSTOMER), row(CUSTOMER), row(ASI, true), row(DANIEL)];
    const out = realInbound(rows, { ignore });
    expect(out.count).toBe(2);
    expect(out.chats).toEqual(["972501112222"]);
  });

  it("excludes chats under a human takeover — silence there is the feature", () => {
    const rows = [row(CUSTOMER), row(CUSTOMER)];
    expect(realInbound(rows, { paused: [CUSTOMER] }).count).toBe(0);
    expect(realInbound(rows, { paused: [CUSTOMER] }).dropped.paused).toBe(2);
    // and the pause list is matched on digits too
    expect(realInbound(rows, { paused: ["972501112222"] }).count).toBe(0);
  });

  it("does not count groups — the bot posts to them, it does not staff them", () => {
    expect(realInbound([row(GROUP), row(CUSTOMER)]).count).toBe(1);
    expect(realInbound([row(GROUP)]).dropped.group).toBe(1);
  });

  it("counts every message in a multi-message envelope", () => {
    const rows = [{
      chat_id: CUSTOMER,
      payload: JSON.stringify({
        messages: [
          { from_me: false, chat_id: CUSTOMER },
          { from_me: false, chat_id: CUSTOMER },
          { from_me: true, chat_id: CUSTOMER },
        ],
      }),
    }];
    const out = realInbound(rows);
    expect(out.count).toBe(2);
    expect(out.dropped.fromMe).toBe(1);
  });

  it("falls back to the row's chat_id when the message omits it", () => {
    const rows = [{ chat_id: ASI, payload: JSON.stringify({ messages: [{ from_me: false }] }) }];
    expect(realInbound(rows, { ignore }).dropped.ignored).toBe(1);
  });

  it("is empty-safe", () => {
    expect(realInbound([]).count).toBe(0);
    expect(realInbound().count).toBe(0);
    expect(realInbound([{ chat_id: CUSTOMER, payload: null }]).dropped.notAMessage).toBe(1);
  });

  it("a burst from one real customer still counts — the rule's threshold decides", () => {
    const rows = Array.from({ length: 9 }, () => row(CUSTOMER));
    expect(realInbound(rows, { ignore }).count).toBe(9);
  });
});

describe("droppedSummary", () => {
  it("says out loud what was discarded", () => {
    expect(droppedSummary({ fromMe: 40, ignored: 35 })).toBe("40 sent by the business, 35 on the ignore list");
    expect(droppedSummary({ paused: 3, group: 1 })).toBe("3 in human takeover, 1 group");
  });
  it("is empty when nothing was discarded", () => {
    expect(droppedSummary({})).toBe("");
    expect(droppedSummary()).toBe("");
    expect(droppedSummary({ notAMessage: 5 })).toBe("");
  });
});
