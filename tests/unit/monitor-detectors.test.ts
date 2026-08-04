import { describe, it, expect } from "vitest";
import {
  detectEvents,
  rollupHealth,
  STUCK_MIN,
  FAILED_SPIKE,
  N8N_ERR_RATE,
  type BotSignals,
} from "../../lib/monitor/detectors";
import { cronAuthorized } from "../../lib/monitor/runner";
import { matchSubscriptions } from "../../lib/notify";

const base: BotSignals = {
  botId: "bot-1",
  ref: "ref1",
  workflowActive: true,
  queueFailed: 0,
  oldestNewAgeMin: 0,
  n8nErrorRate24h: 0,
};

describe("monitor detectors — events", () => {
  it("a healthy bot raises NOTHING", () => {
    expect(detectEvents(base)).toEqual([]);
  });

  it("an inactive workflow raises exactly one BOT_DOWN (stable dedup key)", () => {
    const events = detectEvents({ ...base, workflowActive: false });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "BOT_DOWN", severity: "high", dedupKey: "BOT_DOWN:bot-1" });
  });

  it("a stuck queue (oldest 'new' beyond threshold) raises one QUEUE_STUCK", () => {
    const events = detectEvents({ ...base, oldestNewAgeMin: STUCK_MIN + 5 });
    const stuck = events.filter((e) => e.type === "QUEUE_STUCK");
    expect(stuck).toHaveLength(1);
    expect(stuck[0].dedupKey).toBe("QUEUE_STUCK:bot-1");
    expect(stuck[0].payload).toMatchObject({ oldestNewAgeMin: STUCK_MIN + 5 });
  });

  it("does NOT flag a queue just under the threshold", () => {
    expect(detectEvents({ ...base, oldestNewAgeMin: STUCK_MIN - 1 })).toEqual([]);
  });

  it("a failed spike and an n8n error spike raise their events", () => {
    const ev = detectEvents({ ...base, queueFailed: FAILED_SPIKE, n8nErrorRate24h: N8N_ERR_RATE });
    expect(ev.map((e) => e.type).sort()).toEqual(["FAILED_SPIKE", "N8N_ERROR_SPIKE"]);
  });

  it("an RLS regression is critical", () => {
    const ev = detectEvents({ ...base, rlsDisabledTables: 3 });
    expect(ev[0]).toMatchObject({ type: "RLS_REGRESSION", severity: "critical" });
  });

  it("dedup keys are stable across runs for the same condition (re-run dedups)", () => {
    const a = detectEvents({ ...base, workflowActive: false })[0].dedupKey;
    const b = detectEvents({ ...base, workflowActive: false })[0].dedupKey;
    expect(a).toBe(b);
  });
});

describe("monitor — health rollup", () => {
  it("maps signals to a single status", () => {
    expect(rollupHealth(base)).toBe("healthy");
    expect(rollupHealth({ ...base, workflowActive: false })).toBe("down");
    expect(rollupHealth({ ...base, workflowActive: null })).toBe("unknown");
    expect(rollupHealth({ ...base, oldestNewAgeMin: STUCK_MIN + 1 })).toBe("degraded");
    expect(rollupHealth({ ...base, queueFailed: FAILED_SPIKE })).toBe("degraded");
  });
});

describe("monitor — cron authorization (CRON_SECRET gate)", () => {
  const secret = "s3cr3t";
  it("accepts a matching Bearer header or ?secret query", () => {
    expect(cronAuthorized(`Bearer ${secret}`, null, secret)).toBe(true);
    expect(cronAuthorized(null, secret, secret)).toBe(true);
  });
  it("rejects a missing/wrong secret, and an unset CRON_SECRET disables the endpoint", () => {
    expect(cronAuthorized(null, null, secret)).toBe(false);
    expect(cronAuthorized("Bearer nope", "nope", secret)).toBe(false);
    expect(cronAuthorized(`Bearer ${secret}`, secret, "")).toBe(false); // no secret configured
  });
});

describe("monitor — notification matching", () => {
  const subs = [
    { id: "1", channel: "log", target: null, event_types: [], min_severity: "high" },
    { id: "2", channel: "email", target: "x@y", event_types: ["BOT_DOWN"], min_severity: "medium" },
    { id: "3", channel: "log", target: null, event_types: ["QUEUE_STUCK"], min_severity: "critical" },
  ];
  it("matches by type filter and minimum severity", () => {
    // high BOT_DOWN → sub 1 (all types, high) + sub 2 (BOT_DOWN, medium); not sub 3 (needs critical)
    const m = matchSubscriptions(subs, { type: "BOT_DOWN", severity: "high" }).map((s) => s.id);
    expect(m.sort()).toEqual(["1", "2"]);
  });
  it("excludes subs whose min_severity is above the event", () => {
    const m = matchSubscriptions(subs, { type: "QUEUE_STUCK", severity: "medium" }).map((s) => s.id);
    expect(m).toEqual([]); // sub1 needs high, sub3 needs critical, sub2 wrong type
  });
});
