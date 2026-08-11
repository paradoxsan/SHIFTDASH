import { describe, it, expect } from "vitest";
// plain .mjs, shared verbatim with the watchdog's "Plan: Targets" Code node
import {
  intervalMinutes,
  scheduleIntervalMin,
  silenceGraceMin,
} from "../../lib/bot/schedule-interval.mjs";

const sched = (parameters: unknown, extra: Record<string, unknown> = {}) => ({
  name: "Schedule",
  type: "n8n-nodes-base.scheduleTrigger",
  parameters,
  ...extra,
});

describe("intervalMinutes", () => {
  it("reads the shapes n8n actually stores", () => {
    expect(intervalMinutes({ field: "minutes", minutesInterval: 15 })).toBe(15);
    expect(intervalMinutes({ field: "hours", hoursInterval: 6 })).toBe(360);
    expect(intervalMinutes({ field: "days", daysInterval: 1, triggerAtHour: 4 })).toBe(1440);
    expect(intervalMinutes({ field: "weeks", weeksInterval: 1 })).toBe(10080);
    expect(intervalMinutes({ field: "months", monthsInterval: 1 })).toBe(43200);
  });

  it("defaults a missing field to daily — that is how the live T-CENTER cron arrives", () => {
    // verbatim from workflow KIIGQZPxugci8i1j: {"rule":{"interval":[{"triggerAtHour":4}]}}
    expect(intervalMinutes({ triggerAtHour: 4 })).toBe(1440);
    expect(intervalMinutes({})).toBe(1440);
    expect(intervalMinutes()).toBe(1440);
  });

  it("defaults a missing or nonsense interval count to 1", () => {
    expect(intervalMinutes({ field: "hours" })).toBe(60);
    expect(intervalMinutes({ field: "minutes", minutesInterval: 0 })).toBe(1);
    expect(intervalMinutes({ field: "minutes", minutesInterval: "15" })).toBe(1);
  });

  it("never returns less than a minute", () => {
    expect(intervalMinutes({ field: "seconds", secondsInterval: 30 })).toBe(1);
    expect(intervalMinutes({ field: "seconds", secondsInterval: 90 })).toBe(2);
  });

  it("returns unknown rather than guessing at a cron expression or a new field", () => {
    expect(intervalMinutes({ field: "cronExpression", expression: "0 9 * * *" })).toBeNull();
    expect(intervalMinutes({ field: "fortnights" })).toBeNull();
  });
});

describe("scheduleIntervalMin", () => {
  it("a workflow with no schedule node is not scheduled", () => {
    expect(scheduleIntervalMin([{ type: "n8n-nodes-base.webhook" }])).toEqual({
      scheduled: false,
      expectedMin: null,
      cronUnknown: false,
    });
    expect(scheduleIntervalMin([])).toEqual({
      scheduled: false,
      expectedMin: null,
      cronUnknown: false,
    });
  });

  it("the T-CENTER sales bot is a DAILY schedule, not an hourly one", () => {
    // executeWorkflow-driven bot that merely contains one 04:00 cleanup cron;
    // the old `JSON.stringify(nodes).includes('scheduleTrigger')` test called
    // this "scheduled" and demanded a run every 60 minutes.
    const nodes = [
      { type: "n8n-nodes-base.executeWorkflowTrigger", parameters: { inputSource: "passthrough" } },
      sched({ rule: { interval: [{ triggerAtHour: 4 }] } }),
    ];
    expect(scheduleIntervalMin(nodes)).toEqual({
      scheduled: true,
      expectedMin: 1440,
      cronUnknown: false,
    });
  });

  it("takes the shortest cadence when a workflow has several schedules", () => {
    const nodes = [
      sched({ rule: { interval: [{ field: "days", daysInterval: 1 }] } }),
      sched({ rule: { interval: [{ field: "minutes", minutesInterval: 5 }] } }),
    ];
    expect(scheduleIntervalMin(nodes).expectedMin).toBe(5);
  });

  it("takes the shortest entry inside one schedule node", () => {
    const nodes = [
      sched({ rule: { interval: [{ field: "hours", hoursInterval: 2 }, { field: "minutes", minutesInterval: 10 }] } }),
    ];
    expect(scheduleIntervalMin(nodes).expectedMin).toBe(10);
  });

  it("ignores disabled schedule nodes", () => {
    const nodes = [sched({ rule: { interval: [{ field: "minutes", minutesInterval: 5 }] } }, { disabled: true })];
    expect(scheduleIntervalMin(nodes)).toEqual({
      scheduled: false,
      expectedMin: null,
      cronUnknown: false,
    });
  });

  it("a schedule node with no rule is n8n's default: daily", () => {
    expect(scheduleIntervalMin([sched({})]).expectedMin).toBe(1440);
    expect(scheduleIntervalMin([sched({ rule: { interval: [] } })]).expectedMin).toBe(1440);
  });

  it("flags an unreadable cron instead of inventing a cadence", () => {
    const nodes = [sched({ rule: { interval: [{ field: "cronExpression", expression: "*/5 * * * *" }] } })];
    expect(scheduleIntervalMin(nodes)).toEqual({
      scheduled: true,
      expectedMin: null,
      cronUnknown: true,
    });
  });

  it("still judges the readable half of a mixed workflow", () => {
    const nodes = [
      sched({ rule: { interval: [{ field: "cronExpression", expression: "0 9 * * *" }] } }),
      sched({ rule: { interval: [{ field: "minutes", minutesInterval: 15 }] } }),
    ];
    expect(scheduleIntervalMin(nodes)).toEqual({
      scheduled: true,
      expectedMin: 15,
      cronUnknown: true,
    });
  });
});

describe("silenceGraceMin", () => {
  it("gives fast pollers the old one-hour floor", () => {
    expect(silenceGraceMin(5)).toBe(60);   // BRJewelry callbacks poller
    expect(silenceGraceMin(15)).toBe(60);  // the watchdog itself
  });

  it("scales with the cadence for slower jobs", () => {
    expect(silenceGraceMin(60)).toBe(105);      // hourly -> ~1.75h
    expect(silenceGraceMin(1440)).toBe(2175);   // daily  -> ~36h
    expect(silenceGraceMin(10080)).toBe(15135); // weekly -> ~10.5d
  });

  it("a daily job is not stuck after a quiet Friday night", () => {
    const grace = silenceGraceMin(1440) as number;
    expect(grace).toBeGreaterThan(71);    // the gap that paged us on 2026-08-07
    expect(grace).toBeGreaterThan(24 * 60); // a full silent Shabbat is still fine
  });

  it("has no opinion when the cadence is unknown", () => {
    expect(silenceGraceMin(null)).toBeNull();
    expect(silenceGraceMin(0)).toBeNull();
    expect(silenceGraceMin(NaN)).toBeNull();
  });
});
