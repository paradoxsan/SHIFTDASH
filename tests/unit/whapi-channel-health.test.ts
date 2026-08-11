import { describe, it, expect } from "vitest";
import { channelStatusFromHealth } from "../../lib/whapi";

// Regression suite for the 2026-08-09 BRJewelry outage: the WhatsApp phone was
// unlinked from the channel for 10h on a full working day and CHANNEL_DOWN never
// fired, because the old probe only asked "did WHAPI answer with HTTP 200?" —
// and a logged-out channel answers 200 to everything, it just has no session.
// The only honest discriminator is /health: a linked channel reports AUTH with a
// populated `user`; an unlinked one reports QR with `user: null`.

describe("channelStatusFromHealth — a linked channel", () => {
  it("accepts the healthy shape (AUTH + user)", () => {
    expect(
      channelStatusFromHealth({
        status: { code: 4, text: "AUTH" },
        user: { id: "972559878947:12@s.whatsapp.net", name: "B.R JEWELRY" },
      }),
    ).toEqual({ ok: true });
  });

  it("does not care about the numeric code as long as the text is AUTH", () => {
    expect(channelStatusFromHealth({ status: { text: "auth" }, user: { id: "x" } }).ok).toBe(true);
  });
});

describe("channelStatusFromHealth — the outage that was missed", () => {
  // Verbatim payload captured from the live BRJewelry channel CATWMN-ZBQZD on
  // 2026-08-09T15:46Z, ~10h into a silent outage.
  const realOutage = {
    start_at: 1786229133,
    uptime: 61250,
    status: { code: 3, text: "QR" },
    user: null,
    ip: "157.180.57.243",
    is_business: false,
    channel_id: "CATWMN-ZBQZD",
  };

  it("reports the real outage payload as DOWN", () => {
    const res = channelStatusFromHealth(realOutage);
    expect(res.ok).toBe(false);
    expect(res.detail).toContain("QR");
  });

  it("says the phone needs re-pairing, not that the token is bad", () => {
    // The operator's next action differs completely between the two, so the
    // alert text has to distinguish them.
    expect(channelStatusFromHealth(realOutage).detail).toContain("לא מקושר");
  });

  it("treats every non-connected status text as down", () => {
    for (const text of ["QR", "LAUNCH", "STARTING", "CONFLICT", "LOGGED_OUT", "BANNED"]) {
      expect(channelStatusFromHealth({ status: { text }, user: null }).ok).toBe(false);
    }
  });

  it("is down when the session user is missing even if the text looks fine", () => {
    expect(channelStatusFromHealth({ status: { text: "AUTH" }, user: null }).ok).toBe(false);
    expect(channelStatusFromHealth({ status: { text: "AUTH" } }).ok).toBe(false);
  });

  it("is down when a populated user is paired with a known-bad status", () => {
    // Seen when a second device steals the session: the stale user lingers.
    expect(
      channelStatusFromHealth({ status: { text: "CONFLICT" }, user: { id: "x" } }).ok,
    ).toBe(false);
  });
});

describe("channelStatusFromHealth — unrecognised payloads fail OPEN", () => {
  // A WHAPI schema change must not page the operator every 5 minutes about a
  // bot that is actually fine. Missing BOTH signals means "we cannot tell".
  it("accepts a payload carrying neither status nor user", () => {
    expect(channelStatusFromHealth({ uptime: 42 })).toEqual({ ok: true });
    expect(channelStatusFromHealth({})).toEqual({ ok: true });
  });

  it("accepts non-object bodies rather than crying wolf", () => {
    expect(channelStatusFromHealth(null).ok).toBe(true);
    expect(channelStatusFromHealth("OK").ok).toBe(true);
  });

  it("still trusts an explicit user when the status block is absent", () => {
    expect(channelStatusFromHealth({ user: { id: "x" } })).toEqual({ ok: true });
  });
});
