/* How often is an n8n workflow *supposed* to run on its own?
 *
 * The watchdog's "WORKFLOW NOT RUNNING" rule used to answer that with a guess:
 * any workflow whose JSON mentioned `scheduleTrigger` was expected to run at
 * least hourly. That is wrong twice over.
 *   1. A workflow can *contain* a schedule node and still be traffic-driven —
 *      T-CENTER's sales bot runs on executeWorkflow from the receiver and has a
 *      single "Daily 04:00" cron. Judged against 60 minutes it reports itself
 *      dead every quiet evening, every night, and all of Shabbat.
 *   2. A genuinely scheduled job can run far *less* often than hourly (the
 *      monthly report). Same rule, permanent false alarm.
 * So: read the cron out of the node and compare each workflow against its own
 * cadence. A cadence we cannot read (raw cron expression) is unknown, and the
 * watchdog never alerts on unknown.
 *
 * Inlined verbatim into the watchdog's "Plan: Targets" Code node — edit here,
 * not there, so tests/unit/schedule-interval.test.ts runs the same bytes. */

/** n8n's `rule.interval[].field` values, in minutes. Months are nominal (30d);
 *  the watchdog only needs an order of magnitude, not a calendar. */
export const FIELD_MINUTES = {
  seconds: 1 / 60,
  minutes: 1,
  hours: 60,
  days: 1440,
  weeks: 10080,
  months: 43200,
};

/** One `rule.interval[]` entry → minutes between firings, or null if unreadable.
 *  An entry with no `field` is n8n's default: once a day (that is exactly how
 *  `{ triggerAtHour: 4 }` reaches us from a live workflow). */
export function intervalMinutes(entry = {}) {
  const field = entry.field || "days";
  if (field === "cronExpression") return null; // readable, but not worth a parser
  const unit = FIELD_MINUTES[field];
  if (!unit) return null; // a field this version of n8n did not have
  const raw = entry[field.replace(/s$/, "") + "sInterval"];
  const every = typeof raw === "number" && isFinite(raw) && raw > 0 ? raw : 1;
  return Math.max(1, Math.round(unit * every));
}

/** The schedule nodes of a workflow → how often the workflow fires itself.
 *  @returns {{scheduled: boolean, expectedMin: number|null, cronUnknown: boolean}}
 *    scheduled   — has at least one enabled schedule trigger
 *    expectedMin — shortest readable cadence in minutes (null = nothing readable)
 *    cronUnknown — at least one schedule is a raw cron expression we did not parse
 */
export function scheduleIntervalMin(nodes = []) {
  const triggers = nodes.filter(
    (n) => String(n?.type || "").endsWith("scheduleTrigger") && !n.disabled
  );
  if (!triggers.length) return { scheduled: false, expectedMin: null, cronUnknown: false };

  let expectedMin = null;
  let cronUnknown = false;
  for (const node of triggers) {
    const entries = node?.parameters?.rule?.interval;
    // A schedule node with no rule at all is n8n's default: daily.
    const list = Array.isArray(entries) && entries.length ? entries : [{}];
    for (const entry of list) {
      const mins = intervalMinutes(entry);
      if (mins === null) cronUnknown = true;
      else if (expectedMin === null || mins < expectedMin) expectedMin = mins;
    }
  }
  return { scheduled: true, expectedMin, cronUnknown };
}

/** How long a schedule may stay quiet before it counts as stuck. One missed
 *  firing is a blip (n8n skips a tick under load); one and a half is a fault.
 *  Floored at an hour so a 30-second poller does not page on a 45-second gap. */
export function silenceGraceMin(expectedMin) {
  if (typeof expectedMin !== "number" || !isFinite(expectedMin) || expectedMin <= 0) return null;
  return Math.max(60, Math.round(expectedMin * 1.5) + 15);
}
