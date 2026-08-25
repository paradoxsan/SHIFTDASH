// The failure this file exists for: BRJewelry, 2026-08-20 → 08-25.
//
// n8n active, WHAPI connected, inbox draining, zero failed runs, clean output —
// every detector we had reported the bot healthy. Meanwhile the share of
// conversations נועה actually answered fell from ~0.6 to 0.10, the shop owner
// answered ~220 messages a day by hand, and the client called to say the bot
// was dead. Five days, no alert.
//
// The signal that separates "broken" from "quiet" is not a threshold — a busy
// human-heavy מוקד sits at a permanently low coverage without being broken.
// It is the bot's own history: a bot that used to answer and stopped.
import { describe, it, expect } from "vitest";
import { detectEvents, rollupHealth, type BotSignals } from "../../lib/monitor/detectors";
import { describeEvent } from "../../lib/alerts";

const base: BotSignals = {
  botId: "brjewelry",
  ref: "kracmhwzmgligxngmhmi",
  workflowActive: true,
  queueFailed: 0,
  oldestNewAgeMin: 0,
  n8nErrorRate24h: 0,
  rlsDisabledTables: 0,
};

const types = (s: BotSignals) => detectEvents(s).map((e) => e.type);
const find = (s: BotSignals) => detectEvents(s).find((e) => e.type === "BOT_NOT_ANSWERING");

describe("detectEvents — answer coverage", () => {
  it("raises BOT_NOT_ANSWERING on the real BRJewelry numbers", () => {
    // 2026-08-24: 10 conversations, נועה answered 1. Baseline over the week
    // before: 0.58. Nothing else on the bot looked wrong.
    const e = find({ ...base, activeChats24h: 10, answeredChats24h: 1, coverageBaseline: 0.58 });
    expect(e).toBeDefined();
    expect(e!.dedupKey).toBe("BOT_NOT_ANSWERING:brjewelry");
    expect(e!.payload).toMatchObject({ activeChats24h: 10, answeredChats24h: 1 });
    expect(e!.payload.coverage).toBeCloseTo(0.1, 5);
  });

  it("is critical when the bot answered nobody at all, high otherwise", () => {
    expect(find({ ...base, activeChats24h: 10, answeredChats24h: 0, coverageBaseline: 0.58 })!.severity)
      .toBe("critical");
    expect(find({ ...base, activeChats24h: 10, answeredChats24h: 2, coverageBaseline: 0.58 })!.severity)
      .toBe("high");
  });

  it("stays quiet on a bot that is answering as well as it ever did", () => {
    expect(types({ ...base, activeChats24h: 23, answeredChats24h: 13, coverageBaseline: 0.57 }))
      .not.toContain("BOT_NOT_ANSWERING");
  });

  it("does not fire on a human-heavy מוקד that was never bot-led", () => {
    // T-center: 108 conversations a day, most handled by a person. Chronically
    // low coverage is that bot's normal — it is not a regression.
    expect(types({ ...base, activeChats24h: 108, answeredChats24h: 40, coverageBaseline: 0.38 }))
      .not.toContain("BOT_NOT_ANSWERING");
  });

  it("needs enough conversations to mean anything", () => {
    // A Saturday with 2 chats and no answer is not an incident.
    expect(types({ ...base, activeChats24h: 2, answeredChats24h: 0, coverageBaseline: 0.58 }))
      .not.toContain("BOT_NOT_ANSWERING");
  });

  it("stays quiet when the history is missing rather than guessing", () => {
    // Fail SILENT here, not closed: a brand-new bot has no baseline, and
    // inventing one would page us on every provisioning.
    expect(types({ ...base, activeChats24h: 10, answeredChats24h: 0, coverageBaseline: null }))
      .not.toContain("BOT_NOT_ANSWERING");
    expect(types({ ...base, activeChats24h: 10, answeredChats24h: 0 }))
      .not.toContain("BOT_NOT_ANSWERING");
  });

  it("stays quiet when the bot never carried the conversation to begin with", () => {
    // A baseline that was already bad is a setup problem, not a regression —
    // and firing on it every hour is how an alert channel gets muted.
    expect(types({ ...base, activeChats24h: 20, answeredChats24h: 0, coverageBaseline: 0.2 }))
      .not.toContain("BOT_NOT_ANSWERING");
  });

  it("counts a collapsed bot as degraded, not healthy", () => {
    expect(rollupHealth({ ...base, activeChats24h: 10, answeredChats24h: 1, coverageBaseline: 0.58 }))
      .toBe("degraded");
    expect(rollupHealth({ ...base, activeChats24h: 23, answeredChats24h: 13, coverageBaseline: 0.57 }))
      .toBe("healthy");
  });
});

describe("alert wording — BOT_NOT_ANSWERING", () => {
  it("says how bad it is and where to look, not just that something is wrong", () => {
    const { title, detail } = describeEvent(
      "BOT_NOT_ANSWERING",
      { activeChats24h: 13, answeredChats24h: 2, coverage: 0.154, baseline: 0.574 },
      "BRJewelry"
    );
    expect(title).toContain("BRJewelry");
    expect(detail).toContain("13");
    expect(detail).toContain("15%"); // this day
    expect(detail).toContain("57%"); // its own normal
    expect(detail).toContain("human_mode"); // the first place to look
  });

  it("names the outage case differently from the slide", () => {
    const none = describeEvent("BOT_NOT_ANSWERING", { activeChats24h: 13, answeredChats24h: 0 }, "BRJewelry");
    expect(none.title).toContain("לא עונה לאף אחד");
  });
});
