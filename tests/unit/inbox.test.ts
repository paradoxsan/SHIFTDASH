import { describe, it, expect } from "vitest";
import { mergeInbox, toClientMeta, type InboxSource } from "../../lib/inbox";
import {
  chatIdFromSearch,
  EMPTY_FILTER,
  filterInbox,
  type InboxFilter,
} from "../../components/inbox/filter";
import type { WhapiChat } from "../../lib/types";

function chat(id: string, over: Partial<WhapiChat> = {}): WhapiChat {
  return {
    id,
    name: id.split("@")[0],
    lastMessage: "שלום",
    timestamp: 1_700_000_000,
    unread: 0,
    ...over,
  };
}

function source(over: Partial<InboxSource> = {}): InboxSource {
  return {
    clientId: "t-center",
    clientName: "T center",
    accent: "#2fbf71",
    whapiKey: "tcenter-ref",
    chats: [],
    allow: null,
    paused: new Map(),
    hasHumanMode: false,
    error: null,
    ...over,
  };
}

const f = (over: Partial<InboxFilter> = {}): InboxFilter => ({ ...EMPTY_FILTER, ...over });

describe("mergeInbox", () => {
  it("orders every client's chats into one newest-first stream", () => {
    const merged = mergeInbox([
      source({ chats: [chat("1@s.whatsapp.net", { timestamp: 100 })] }),
      source({
        clientId: "brjewelry",
        clientName: "BRJewelry",
        whapiKey: "paradox-ref",
        chats: [
          chat("2@s.whatsapp.net", { timestamp: 300 }),
          chat("3@s.whatsapp.net", { timestamp: 200 }),
        ],
      }),
    ]);
    expect(merged.map((c) => c.chatId)).toEqual([
      "2@s.whatsapp.net",
      "3@s.whatsapp.net",
      "1@s.whatsapp.net",
    ]);
    expect(merged[0].clientName).toBe("BRJewelry");
  });

  it("sinks chats with no timestamp to the bottom rather than the top", () => {
    const merged = mergeInbox([
      source({
        chats: [chat("no-ts@s.whatsapp.net", { timestamp: null }), chat("a@s.whatsapp.net", { timestamp: 5 })],
      }),
    ]);
    expect(merged.map((c) => c.chatId)).toEqual(["a@s.whatsapp.net", "no-ts@s.whatsapp.net"]);
  });

  it("keys chats per client so the same phone under two clients stays distinct", () => {
    const merged = mergeInbox([
      source({ chats: [chat("972500000000@s.whatsapp.net")] }),
      source({
        clientId: "brjewelry",
        clientName: "BRJewelry",
        whapiKey: "paradox-ref",
        chats: [chat("972500000000@s.whatsapp.net")],
      }),
    ]);
    expect(new Set(merged.map((c) => c.key)).size).toBe(2);
  });

  // The campaign bot runs on a real business phone. Leaking the owner's personal
  // chats into the agency inbox is the failure this guards.
  it("keeps only allowlisted chats for a campaign client, and everything for others", () => {
    const merged = mergeInbox([
      source({
        clientId: "brjewelry",
        clientName: "BRJewelry",
        chats: [chat("ad@s.whatsapp.net"), chat("private@s.whatsapp.net")],
        allow: new Set(["ad@s.whatsapp.net"]),
      }),
      source({ chats: [chat("anyone@s.whatsapp.net")] }),
    ]);
    expect(merged.map((c) => c.chatId).sort()).toEqual(["ad@s.whatsapp.net", "anyone@s.whatsapp.net"]);
  });

  it("marks a taken-over chat as paused, and a lapsed silence window separately", () => {
    const merged = mergeInbox([
      source({
        hasHumanMode: true,
        chats: [chat("live@s.whatsapp.net"), chat("lapsed@s.whatsapp.net"), chat("free@s.whatsapp.net")],
        paused: new Map([
          ["live@s.whatsapp.net", { until: "2026-08-06T12:00:00Z", expired: false }],
          ["lapsed@s.whatsapp.net", { until: "2026-08-01T12:00:00Z", expired: true }],
        ]),
      }),
    ]);
    const byId = Object.fromEntries(merged.map((c) => [c.chatId, c]));
    expect(byId["live@s.whatsapp.net"].paused).toBe(true);
    expect(byId["live@s.whatsapp.net"].pausedUntil).toBe("2026-08-06T12:00:00Z");
    expect(byId["lapsed@s.whatsapp.net"].paused).toBe(false);
    expect(byId["lapsed@s.whatsapp.net"].pauseExpired).toBe(true);
    expect(byId["free@s.whatsapp.net"].paused).toBe(false);
  });

  it("carries the human-mode capability onto each chat so the UI only offers a real control", () => {
    const merged = mergeInbox([
      source({ hasHumanMode: false, chats: [chat("a@s.whatsapp.net")] }),
      source({
        clientId: "brjewelry",
        clientName: "BRJewelry",
        hasHumanMode: true,
        chats: [chat("b@s.whatsapp.net")],
      }),
    ]);
    expect(merged.find((c) => c.chatId === "a@s.whatsapp.net")!.hasHumanMode).toBe(false);
    expect(merged.find((c) => c.chatId === "b@s.whatsapp.net")!.hasHumanMode).toBe(true);
  });

  it("a broken channel contributes nothing but never removes another client's chats", () => {
    const sources = [
      source({ chats: [], error: "WHAPI 401: token expired" }),
      source({
        clientId: "brjewelry",
        clientName: "BRJewelry",
        chats: [chat("alive@s.whatsapp.net")],
      }),
    ];
    const merged = mergeInbox(sources);
    expect(merged).toHaveLength(1);
    const meta = toClientMeta(sources, merged);
    expect(meta.find((m) => m.id === "t-center")!.error).toContain("401");
    expect(meta.find((m) => m.id === "brjewelry")!.chatCount).toBe(1);
  });

  it("reports the post-filter chat count per client, not the raw one", () => {
    const sources = [
      source({
        chats: [chat("ad@s.whatsapp.net"), chat("private@s.whatsapp.net")],
        allow: new Set(["ad@s.whatsapp.net"]),
      }),
    ];
    const meta = toClientMeta(sources, mergeInbox(sources));
    expect(meta[0].chatCount).toBe(1);
    expect(meta[0].campaignOnly).toBe(true);
  });
});

describe("filterInbox", () => {
  const chats = mergeInbox([
    source({
      chats: [
        chat("972501112233@s.whatsapp.net", { name: "דנה כהן", unread: 2, timestamp: 300 }),
        chat("972544445555@s.whatsapp.net", { name: "יוסי", unread: 0, timestamp: 200 }),
      ],
      hasHumanMode: true,
      paused: new Map([["972544445555@s.whatsapp.net", { until: null, expired: false }]]),
    }),
    source({
      clientId: "brjewelry",
      clientName: "BRJewelry",
      whapiKey: "paradox-ref",
      chats: [chat("972509998888@s.whatsapp.net", { name: "Ruth", unread: 1, timestamp: 100 })],
    }),
  ]);

  it("returns everything when nothing is set", () => {
    expect(filterInbox(chats, f())).toHaveLength(3);
  });

  it("narrows to one client", () => {
    expect(filterInbox(chats, f({ clientId: "brjewelry" })).map((c) => c.name)).toEqual(["Ruth"]);
  });

  it("matches a contact name case-insensitively", () => {
    expect(filterInbox(chats, f({ search: "ruth" })).map((c) => c.name)).toEqual(["Ruth"]);
    expect(filterInbox(chats, f({ search: "דנה" }))).toHaveLength(1);
  });

  it("matches a phone fragment but ignores a fragment too short to mean anything", () => {
    expect(filterInbox(chats, f({ search: "4444" })).map((c) => c.name)).toEqual(["יוסי"]);
    // "9" alone appears in every number — treat it as a name search instead.
    expect(filterInbox(chats, f({ search: "9" }))).toHaveLength(0);
  });

  it("filters to unread and to muted chats", () => {
    expect(filterInbox(chats, f({ onlyUnread: true })).map((c) => c.name)).toEqual(["דנה כהן", "Ruth"]);
    expect(filterInbox(chats, f({ onlyPaused: true })).map((c) => c.name)).toEqual(["יוסי"]);
  });

  it("combines filters", () => {
    expect(filterInbox(chats, f({ clientId: "t-center", onlyUnread: true }))).toHaveLength(1);
    expect(filterInbox(chats, f({ clientId: "brjewelry", onlyPaused: true }))).toHaveLength(0);
  });
});

describe("chatIdFromSearch", () => {
  it("turns a local Israeli number into a WhatsApp chat id", () => {
    expect(chatIdFromSearch("050-111-2233")).toBe("972501112233@s.whatsapp.net");
  });

  it("keeps an already-international number as typed", () => {
    expect(chatIdFromSearch("972501112233")).toBe("972501112233@s.whatsapp.net");
  });

  it("refuses anything too short to be a phone number", () => {
    expect(chatIdFromSearch("דנה")).toBeNull();
    expect(chatIdFromSearch("0501")).toBeNull();
  });
});
