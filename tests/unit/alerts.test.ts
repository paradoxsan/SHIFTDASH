import { describe, it, expect } from "vitest";
import { describeEvent, severityTone, sortAlerts, toAlertView } from "../../lib/alerts";

describe("alert wording", () => {
  it("names the client and says what to do about an expired credential", () => {
    const d = describeEvent(
      "CREDENTIAL_EXPIRED",
      { message: "invalid_grant — token expired" },
      "Shift Digital"
    );
    expect(d.title).toContain("Shift Digital");
    expect(d.detail).toContain("invalid_grant");
    expect(d.detail).toContain("לחבר מחדש");
  });

  it("explains a downed channel in terms of impact, not jargon", () => {
    const d = describeEvent("CHANNEL_DOWN", { detail: "טוקן לא תקף (401)" }, "BRJewelry");
    expect(d.title).toContain("BRJewelry");
    expect(d.detail).toContain("לא יכול לקבל או לשלוח");
  });

  it("converts a stuck-queue age into minutes a human can act on", () => {
    expect(describeEvent("QUEUE_STUCK", { oldestNewAgeMin: 67.4 }, "T center").detail).toContain(
      "67 דקות"
    );
  });

  it("renders a silent bot's gap in hours", () => {
    expect(describeEvent("BOT_SILENT", { lastInboundAgeMin: 900 }, "T center").detail).toContain(
      "15 שעות"
    );
  });

  it("labels agency integrations by what they do, not their vendor name", () => {
    expect(describeEvent("INTEGRATION_DOWN", { integration: "google-sheets" }, "").title).toContain(
      "CRM"
    );
  });

  it("degrades gracefully on an unknown event type", () => {
    const d = describeEvent("SOMETHING_NEW", { a: 1 }, "T center");
    expect(d.title).toContain("SOMETHING_NEW");
  });
});

describe("alert triage", () => {
  it("maps severity to tone", () => {
    expect(severityTone("critical")).toBe("err");
    expect(severityTone("high")).toBe("err");
    expect(severityTone("medium")).toBe("warn");
    expect(severityTone("low")).toBe("brand");
  });

  it("puts the most urgent alert first, newest first within a severity", () => {
    const mk = (id: number, severity: string, created_at: string) =>
      toAlertView(
        { id, type: "BOT_DOWN", severity, payload: null, created_at, bot_id: null },
        null
      );
    const sorted = sortAlerts([
      mk(1, "medium", "2026-08-04T10:00:00Z"),
      mk(2, "critical", "2026-08-04T09:00:00Z"),
      mk(3, "critical", "2026-08-04T11:00:00Z"),
    ]);
    expect(sorted.map((a) => a.id)).toEqual([3, 2, 1]);
  });

  it("builds a copilot prompt that carries the client and the problem", () => {
    const v = toAlertView(
      {
        id: 7,
        type: "CHANNEL_DOWN",
        severity: "critical",
        payload: { detail: "WHAPI 404" },
        created_at: "2026-08-04T10:00:00Z",
        bot_id: "b1",
      },
      { id: "brjewelry", name: "BRJewelry" }
    );
    expect(v.askPrompt).toContain("BRJewelry");
    expect(v.askPrompt).toContain("CHANNEL_DOWN");
    expect(v.clientId).toBe("brjewelry");
  });
});
