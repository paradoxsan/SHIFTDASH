// ── Client cards (Phase 3) ────────────────────────────────────────────────────
// One client, three answers: is their bot working, have they paid me, and what
// did we actually agree. Assembled here so the list screen and the detail screen
// can never disagree about a client's status.
//
// Every source is fetched defensively: Morning being down must degrade the
// payment badge to "unknown", not blank the whole clients screen.
import { loadClients, type ClientDef } from "../registry";
import { listBotIdentity } from "../control-plane";
import { listBotHealth, listEvents } from "../events";
import { listContractsBySlug, type Contract } from "../contracts";
import { listDocuments, listMorningClients, morningConfigured } from "../morning";
import { clientPaymentStatus, type MorningDoc, type PaymentStatus } from "../billing";
import { sortAlerts, toAlertView, type AlertView } from "../alerts";
import { todayInIsrael } from "../reminders";

/** How far back to pull invoices when judging whether a client is square with me.
 *  Long enough to catch a genuinely stale debt, short enough to stay one page. */
const LOOKBACK_DAYS = 400;

export interface ClientCard {
  id: string;
  name: string;
  workspace: string;
  accent: string | null;
  /** Bot health rollup from the monitor: healthy | degraded | down | unknown. */
  health: string;
  healthCheckedAt: string | null;
  /** Open alerts for this client, most urgent first. */
  alerts: AlertView[];
  openAlertCount: number;
  contract: Contract | null;
  payment: PaymentStatus;
}

export interface ClientCardsResult {
  clients: ClientCard[];
  morningConnected: boolean;
  /** Why the payment column is blank, when it is. */
  morningError: string | null;
  generatedAt: string;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/** Documents grouped by the Morning client they belong to. */
function groupByMorningClient(docs: MorningDoc[]): Map<string, MorningDoc[]> {
  const out = new Map<string, MorningDoc[]>();
  for (const d of docs) {
    if (!d.clientId) continue;
    const list = out.get(d.clientId);
    if (list) list.push(d);
    else out.set(d.clientId, [d]);
  }
  return out;
}

function normalizeName(name: string | null): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Every Morning customer id that is really the same customer as `morningId`.
 *
 * Morning happily holds several records under one name — the live books have two
 * "טי סנטר" and two "Br jewlery", with receipts split between them. A contract
 * links to exactly ONE id, so matching on that id alone attributes half a
 * client's payments to nobody and reports "טרם שולם החודש" for a client who
 * paid. Same name ⇒ same customer, which is the assumption a human makes when
 * looking at that list anyway.
 */
export function sameCustomerIds(morningId: string, nameById: Map<string, string>): Set<string> {
  const ids = new Set([morningId]);
  const name = normalizeName(nameById.get(morningId) ?? null);
  if (!name) return ids;
  for (const [id, other] of nameById) {
    if (normalizeName(other) === name) ids.add(id);
  }
  return ids;
}

export interface PaymentStatuses {
  /** False when Morning is unconfigured or the call failed — the statuses are
   *  all "unknown" and callers must NOT treat that as "nothing is owed". */
  evaluated: boolean;
  error: string | null;
  connected: boolean;
  today: string;
  bySlug: Record<string, PaymentStatus>;
  contracts: Record<string, Contract | null>;
}

/**
 * Where every client stands with me. Shared by the clients screen and the
 * monitor cron so the overdue badge and the overdue alert can't disagree.
 */
export async function loadPaymentStatuses(): Promise<PaymentStatuses> {
  const today = todayInIsrael();
  const connected = morningConfigured();
  const [clients, contracts] = await Promise.all([
    loadClients().catch((): ClientDef[] => []),
    listContractsBySlug().catch(() => ({} as Record<string, Contract | null>)),
  ]);

  let docsByClient = new Map<string, MorningDoc[]>();
  const nameById = new Map<string, string>();
  let error: string | null = null;
  if (connected) {
    try {
      const [{ docs }, morningClients] = await Promise.all([
        listDocuments(isoDaysAgo(LOOKBACK_DAYS), today),
        // Only used to spot duplicate customer records; a failure here must not
        // cost us the payment statuses, so it degrades to id-only matching.
        listMorningClients().catch(() => []),
      ]);
      docsByClient = groupByMorningClient(docs);
      for (const mc of morningClients) nameById.set(mc.id, mc.name);
      // A document can name a customer Morning's client list does not (or no
      // longer) carry — take the name from the document itself as well.
      for (const d of docs) {
        if (d.clientId && d.clientName && !nameById.has(d.clientId)) {
          nameById.set(d.clientId, d.clientName);
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  const evaluated = connected && error === null;

  const bySlug: Record<string, PaymentStatus> = {};
  for (const c of clients) {
    const contract = contracts[c.id] ?? null;
    const morningId = contract?.morningClientId ?? null;
    const docs = morningId
      ? [...sameCustomerIds(morningId, nameById)].flatMap((id) => docsByClient.get(id) ?? [])
      : [];
    bySlug[c.id] = clientPaymentStatus({
      contract,
      docs,
      today,
      morningConfigured: evaluated,
    });
  }
  return { evaluated, error, connected, today, bySlug, contracts };
}

export async function buildClientCards(): Promise<ClientCardsResult> {
  const [payments, clients, identities, health, events] = await Promise.all([
    loadPaymentStatuses(),
    loadClients().catch((): ClientDef[] => []),
    listBotIdentity().catch(() => []),
    listBotHealth().catch(() => ({} as Record<string, { status: string; updated_at: string }>)),
    listEvents({ status: "open", limit: 200 }).catch(() => []),
  ]);
  const { contracts, error: morningError, connected } = payments;

  const botIdBySlug = new Map(identities.map((i) => [i.slug, i.id]));
  const nameById = new Map(clients.map((c) => [c.id, c.name]));

  const cards: ClientCard[] = clients.map((c) => {
    const botId = botIdBySlug.get(c.id);
    const contract = contracts[c.id] ?? null;

    const clientAlerts = sortAlerts(
      events
        .filter((e) => botId != null && e.bot_id === botId)
        .map((e) => toAlertView(e, { id: c.id, name: nameById.get(c.id) ?? c.name }))
    );

    return {
      id: c.id,
      name: c.name,
      workspace: c.workspace,
      accent: c.accent ?? null,
      health: botId ? health[botId]?.status ?? "unknown" : "unknown",
      healthCheckedAt: botId ? health[botId]?.updated_at ?? null : null,
      alerts: clientAlerts,
      openAlertCount: clientAlerts.length,
      contract,
      // A failed Morning call reads as "unknown", never as "paid".
      payment: payments.bySlug[c.id] ?? {
        state: "unknown",
        openAmount: 0,
        overdueAmount: 0,
        oldestDueDate: null,
        daysOverdue: 0,
        openCount: 0,
        lastPaidOn: null,
        lastPaidAmount: 0,
      },
    };
  });

  return {
    clients: cards,
    morningConnected: connected,
    morningError,
    generatedAt: new Date().toISOString(),
  };
}

/** One client's card, or null if the slug isn't a live client. */
export async function buildClientCard(slug: string): Promise<ClientCard | null> {
  const { clients } = await buildClientCards();
  return clients.find((c) => c.id === slug) ?? null;
}
