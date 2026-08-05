// ── Monitor runner (BotOps Phase 8) ───────────────────────────────────────────
// One cron cycle: for each bot, gather signals (least-priv path), detect events,
// dispatch them (deduped), fan out NEW ones, auto-resolve cleared conditions, and
// upsert the health rollup. Bounded + per-bot error-isolated + idempotent; runs
// as a system actor in the audit log.
import { loadClients, type ClientDef } from "../registry";
import { listBotIdentity } from "../control-plane";
import { listWorkflows, listExecutions } from "../n8n";
import { gatherSignals, type ExecutionsContext } from "./signals";
import {
  detectEvents,
  detectIntegrationEvent,
  detectPaymentEvent,
  rollupHealth,
  type DetectedEvent,
} from "./detectors";
import { loadPaymentStatuses } from "../services/client-cards";
import {
  dispatchEvent,
  resolveStaleEvents,
  resolveIntegrationEvents,
  upsertBotHealth,
  systemAudit,
} from "../events";
import { fanOutEvent } from "../notify";
import { greenConfigured, greenGetState } from "../green-api";
import { listLeads } from "../leads-sheet";

export interface MonitorResult {
  botsChecked: number;
  eventsRaised: number;
  notified: number;
  errors: number;
}

const MAX_BOTS = 50; // bound the cron's work per cycle

/** Pure: is a cron request authorized? Accepts a Bearer header (Vercel Cron) or
 *  a ?secret= query param. An empty/missing secret denies (endpoint disabled). */
export function cronAuthorized(authHeader: string | null, querySecret: string | null, secret: string): boolean {
  if (!secret) return false;
  return authHeader === `Bearer ${secret}` || querySecret === secret;
}

export async function runMonitor(): Promise<MonitorResult> {
  const result: MonitorResult = { botsChecked: 0, eventsRaised: 0, notified: 0, errors: 0 };

  const [clients, identities, workflows, recent] = await Promise.all([
    loadClients(),
    listBotIdentity(),
    listWorkflows().catch(() => []),
    // One executions sweep for the whole cycle — each bot slices what it needs
    // instead of hitting n8n again.
    listExecutions({ limit: 250 }).catch(() => []),
  ]);
  const idBySlug = new Map(identities.map((i) => [i.slug, i]));
  const execCtx: ExecutionsContext = { recent };

  // Late invoices, computed once for the whole cycle. Attributed to the client's
  // bot so the alert reads "BRJewelry בפיגור" rather than coming from nowhere.
  const payments = await loadPaymentStatuses().catch(() => null);
  const paymentEvent = (slug: string, currency: string): DetectedEvent | null => {
    const p = payments?.bySlug[slug];
    if (!payments?.evaluated || !p) return null;
    return detectPaymentEvent({
      clientId: slug,
      daysOverdue: p.daysOverdue,
      overdueAmount: p.overdueAmount,
      currency,
    });
  };

  for (const client of clients.slice(0, MAX_BOTS) as ClientDef[]) {
    const identity = idBySlug.get(client.id);
    if (!identity) continue; // not yet in the control-plane bots table
    result.botsChecked++;
    try {
      const sig = await gatherSignals(client, workflows, identity.id, execCtx);
      const overdue = paymentEvent(
        client.id,
        payments?.contracts[client.id]?.currency ?? "ILS"
      );
      const events = overdue ? [...detectEvents(sig), overdue] : detectEvents(sig);

      for (const e of events) {
        const { created, id } = await dispatchEvent({
          botId: identity.id,
          tenantId: identity.tenant_id,
          type: e.type,
          severity: e.severity,
          dedupKey: e.dedupKey,
          payload: e.payload,
        });
        if (created && id != null) {
          result.eventsRaised++;
          const { notified } = await fanOutEvent({ id, type: e.type, severity: e.severity });
          result.notified += notified;
        }
      }

      // Clear conditions that are no longer present. When Morning could not be
      // read this cycle we know nothing about the client's balance, so an open
      // PAYMENT_OVERDUE is preserved rather than falsely resolved (and then
      // re-raised, re-notifying, on the next successful cycle).
      const keepKeys = events.map((e) => e.dedupKey);
      if (!payments?.evaluated) keepKeys.push(`PAYMENT_OVERDUE:${client.id}`);
      await resolveStaleEvents(identity.id, keepKeys);

      await upsertBotHealth({
        botId: identity.id,
        queueFailed: sig.queueFailed,
        oldestNewAgeMin: sig.oldestNewAgeMin,
        n8nErrorRate24h: sig.n8nErrorRate24h,
        workflowActive: sig.workflowActive,
        status: rollupHealth(sig),
      });
    } catch {
      result.errors++; // isolate per-bot failures so one bad bot doesn't stop the cycle
    }
  }

  await checkIntegrations(result);

  await systemAudit("monitor.cron", { ...result }, "ok");
  return result;
}

/**
 * Agency-level dependencies that belong to no single bot: the Green API instance
 * the SDR sends through, and the Google Sheet that IS the agency CRM. Both have
 * failed silently before — a dead Sheets credential is what let the BRJewelry
 * media loop run unnoticed.
 */
async function checkIntegrations(result: MonitorResult): Promise<void> {
  const probes: { name: string; ok: boolean; detail?: string }[] = [];

  if (greenConfigured()) {
    try {
      const state = await greenGetState();
      probes.push({
        name: "green-api",
        ok: state.toLowerCase() === "authorized",
        detail: `state=${state}`,
      });
    } catch (e) {
      probes.push({ name: "green-api", ok: false, detail: e instanceof Error ? e.message : "" });
    }
  }

  try {
    await listLeads();
    probes.push({ name: "google-sheets", ok: true });
  } catch (e) {
    probes.push({ name: "google-sheets", ok: false, detail: e instanceof Error ? e.message : "" });
  }

  const activeKeys: string[] = [];
  for (const p of probes) {
    const event = detectIntegrationEvent(p.name, p.ok, p.detail);
    if (!event) continue;
    activeKeys.push(event.dedupKey);
    const { created, id } = await dispatchEvent({
      botId: null,
      type: event.type,
      severity: event.severity,
      dedupKey: event.dedupKey,
      payload: event.payload,
    });
    if (created && id != null) {
      result.eventsRaised++;
      const { notified } = await fanOutEvent({ id, type: event.type, severity: event.severity });
      result.notified += notified;
    }
  }

  // Resolve integration alerts whose probe now passes. Scoped by dedup_key
  // prefix because these events carry no bot_id.
  await resolveIntegrationEvents(
    probes.map((p) => `INTEGRATION_DOWN:${p.name}`),
    activeKeys
  );
}
