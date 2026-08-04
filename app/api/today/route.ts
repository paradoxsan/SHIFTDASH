// Everything the "היום" screen needs, in one request: what is broken, which bots
// are healthy, and which of my own leads need chasing. Each source is isolated
// so one dead integration degrades a section instead of blanking the page.
import { ok, fail } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/current-user";
import { requireRole } from "@/lib/rbac";
import { loadClients } from "@/lib/registry";
import { listBotIdentity } from "@/lib/control-plane";
import { listEvents, listBotHealth } from "@/lib/events";
import { listLeads } from "@/lib/leads-sheet";
import { sortAlerts, toAlertView, type AlertView } from "@/lib/alerts";
import { bucketOf, parseReminder, relativeLabel, todayInIsrael } from "@/lib/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface TodayLead {
  rowIndex: number;
  name: string;
  phone: string;
  status: string;
  bucket: string;
  label: string;
}

export interface TodayBot {
  id: string;
  name: string;
  status: string;
  checkedAt: string | null;
}

export async function GET(req: Request) {
  try {
    const actor = await getCurrentUser(req);
    requireRole(actor?.role, "viewer");

    const [clients, identities, events, health] = await Promise.all([
      loadClients().catch(() => []),
      listBotIdentity().catch(() => []),
      listEvents({ status: "open", limit: 100 }).catch(() => []),
      listBotHealth().catch(() => ({} as Record<string, { status: string; updated_at: string }>)),
    ]);

    const clientByBotId = new Map(
      identities
        .map((i) => {
          const c = clients.find((x) => x.id === i.slug);
          return c ? ([i.id, { id: c.id, name: c.name }] as const) : null;
        })
        .filter((x): x is readonly [string, { id: string; name: string }] => x !== null)
    );

    const alerts: AlertView[] = sortAlerts(
      events.map((e) => toAlertView(e, e.bot_id ? clientByBotId.get(e.bot_id) ?? null : null))
    );

    const bots: TodayBot[] = identities
      .map((i): TodayBot | null => {
        const c = clients.find((x) => x.id === i.slug);
        if (!c) return null;
        return {
          id: c.id,
          name: c.name,
          status: health[i.id]?.status ?? "unknown",
          checkedAt: health[i.id]?.updated_at ?? null,
        };
      })
      .filter((b): b is TodayBot => b !== null);

    // My own pipeline — the one piece of "business" data that IS the agency's.
    let leads: TodayLead[] = [];
    let leadsError: string | null = null;
    try {
      const today = todayInIsrael();
      const { leads: all } = await listLeads();
      leads = all
        .map((l): TodayLead | null => {
          const iso = parseReminder(l.values["תזכורת"]);
          if (!iso) return null;
          const bucket = bucketOf(iso, today);
          if (bucket !== "overdue" && bucket !== "today") return null;
          return {
            rowIndex: l.rowIndex,
            name: l.values["שם"] ?? "",
            phone: l.values["טלפון"] ?? "",
            status: l.values["סטטוס"] ?? "",
            bucket,
            label: relativeLabel(iso, today),
          };
        })
        .filter((l): l is TodayLead => l !== null);
      // Overdue first — those are the ones actually slipping.
      leads.sort(
        (a, b) => (a.bucket === "overdue" ? 0 : 1) - (b.bucket === "overdue" ? 0 : 1)
      );
    } catch (e) {
      leadsError = e instanceof Error ? e.message : String(e);
    }

    return ok({
      generatedAt: new Date().toISOString(),
      alerts,
      bots,
      leads,
      leadsError,
      counts: {
        critical: alerts.filter((a) => a.severity === "critical").length,
        high: alerts.filter((a) => a.severity === "high").length,
        other: alerts.filter((a) => !["critical", "high"].includes(a.severity)).length,
        leadsDue: leads.length,
        botsDown: bots.filter((b) => b.status === "down").length,
      },
    });
  } catch (e) {
    return fail(e);
  }
}
