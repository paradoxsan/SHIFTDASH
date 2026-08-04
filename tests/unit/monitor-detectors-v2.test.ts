import { describe, it, expect } from "vitest";
import {
  detectEvents,
  detectIntegrationEvent,
  looksLikeCredentialFailure,
  rollupHealth,
  type BotSignals,
} from "../../lib/monitor/detectors";

const base: BotSignals = {
  botId: "bot-1",
  ref: "proj",
  workflowActive: true,
  queueFailed: 0,
  oldestNewAgeMin: 0,
  n8nErrorRate24h: 0,
  rlsDisabledTables: 0,
};

const types = (s: BotSignals) => detectEvents(s).map((e) => e.type);

describe("credential-failure matcher", () => {
  it("recognises the real Google OAuth failures that killed the SDR bot twice", () => {
    for (const msg of [
      "Google Calendar: invalid_grant — token has been expired or revoked",
      "Unable to sign without access token (refresh token missing)",
      "The credentials are invalid — please reconnect the account",
      "Request failed with status code 401",
      "OAuth2 authentication failed",
    ]) {
      expect(looksLikeCredentialFailure(msg), msg).toBe(true);
    }
  });

  it("does not fire on ordinary workflow bugs", () => {
    for (const msg of [
      "Cannot read properties of undefined (reading 'json')",
      "ERROR: duplicate key value violates unique constraint",
      "Request failed with status code 524",
      "Item index 0 not found in node output",
    ]) {
      expect(looksLikeCredentialFailure(msg), msg).toBe(false);
    }
  });
});

describe("detectEvents — credentials", () => {
  it("raises a critical CREDENTIAL_EXPIRED with the offending message", () => {
    const events = detectEvents({
      ...base,
      recentErrorMessages: ["Google Calendar: invalid_grant — token expired"],
    });
    const e = events.find((x) => x.type === "CREDENTIAL_EXPIRED");
    expect(e?.severity).toBe("critical");
    expect(String(e?.payload.message)).toContain("invalid_grant");
    expect(e?.dedupKey).toBe("CREDENTIAL_EXPIRED:bot-1");
  });

  it("stays silent when recent errors are ordinary bugs", () => {
    expect(types({ ...base, recentErrorMessages: ["Cannot read properties of undefined"] })).not.toContain(
      "CREDENTIAL_EXPIRED"
    );
  });
});

describe("detectEvents — channel", () => {
  it("raises CHANNEL_DOWN when the WhatsApp probe fails", () => {
    const e = detectEvents({ ...base, channelOk: false, channelDetail: "טוקן לא תקף (401)" }).find(
      (x) => x.type === "CHANNEL_DOWN"
    );
    expect(e?.severity).toBe("critical");
    expect(e?.payload.detail).toContain("401");
  });

  it("does not fire when the channel is fine or unconfigured", () => {
    expect(types({ ...base, channelOk: true })).not.toContain("CHANNEL_DOWN");
    expect(types({ ...base, channelOk: null })).not.toContain("CHANNEL_DOWN");
  });
});

describe("detectEvents — silence", () => {
  it("flags a busy bot that suddenly stopped receiving messages", () => {
    const e = detectEvents({ ...base, lastInboundAgeMin: 900, inbound7d: 400 }).find(
      (x) => x.type === "BOT_SILENT"
    );
    expect(e?.severity).toBe("medium");
  });

  it("does NOT flag a genuinely low-traffic bot", () => {
    // The whole point of inbound7d: quiet ≠ broken.
    expect(types({ ...base, lastInboundAgeMin: 5000, inbound7d: 3 })).not.toContain("BOT_SILENT");
  });

  it("does not flag a busy bot that got a message an hour ago", () => {
    expect(types({ ...base, lastInboundAgeMin: 60, inbound7d: 400 })).not.toContain("BOT_SILENT");
  });
});

describe("integration probes", () => {
  it("returns null while the integration is healthy", () => {
    expect(detectIntegrationEvent("green-api", true)).toBeNull();
  });

  it("raises a high-severity event with a stable dedup key when it fails", () => {
    const e = detectIntegrationEvent("google-sheets", false, "403 forbidden");
    expect(e).toMatchObject({ type: "INTEGRATION_DOWN", severity: "high" });
    expect(e?.dedupKey).toBe("INTEGRATION_DOWN:google-sheets");
    expect(e?.payload.integration).toBe("google-sheets");
  });
});

describe("rollupHealth with the new signals", () => {
  it("reports DOWN for a dead credential even while n8n says active", () => {
    expect(rollupHealth({ ...base, recentErrorMessages: ["invalid_grant"] })).toBe("down");
  });

  it("reports DOWN for a disconnected channel even while n8n says active", () => {
    expect(rollupHealth({ ...base, channelOk: false })).toBe("down");
  });

  it("reports DEGRADED for unexplained silence on a busy bot", () => {
    expect(rollupHealth({ ...base, lastInboundAgeMin: 900, inbound7d: 400 })).toBe("degraded");
  });

  it("still reports HEALTHY for a working bot", () => {
    expect(rollupHealth({ ...base, channelOk: true, lastInboundAgeMin: 4, inbound7d: 300 })).toBe(
      "healthy"
    );
  });
});
