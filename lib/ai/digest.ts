// ── Cross-bot daily digest (BotOps Phase 9) ───────────────────────────────────
// Aggregate per-bot KPIs, then ONE cost-aware Claude call summarises them. The
// result is cached per (date, scope) so it costs at most one call/day. Without
// ANTHROPIC_API_KEY the KPIs still return (brief = null).
import { loadClients } from "../registry";
import { getAnalytics } from "../analytics";
import { claudeText } from "./anthropic";
import { runSql } from "../supabase-management";
import { controlPlaneRef } from "../control-plane";
import { sqlString } from "../sql";

export interface CrossBotKpi {
  botId: string;
  name: string;
  messages: number;
  orders: number;
  revenue: number;
}

export async function crossBotKpis(): Promise<CrossBotKpi[]> {
  const clients = await loadClients();
  const out: CrossBotKpi[] = [];
  for (const c of clients) {
    try {
      const a = await getAnalytics(c);
      out.push({ botId: c.id, name: c.name, messages: a.totals.messages, orders: a.totals.orders, revenue: a.totals.revenue });
    } catch {
      out.push({ botId: c.id, name: c.name, messages: 0, orders: 0, revenue: 0 });
    }
  }
  return out;
}

export interface DigestResult {
  kpis: CrossBotKpi[];
  brief: string | null;
  cached: boolean;
}

export async function dailyDigest(date: string): Promise<DigestResult> {
  const cp = controlPlaneRef();
  const existing = await runSql<{ summary: { kpis: CrossBotKpi[]; brief: string | null } }>(
    cp,
    `select summary from botops.digests where date = ${sqlString(date)}::date and scope = 'all' limit 1`
  );
  if (existing[0]?.summary) {
    return { kpis: existing[0].summary.kpis ?? [], brief: existing[0].summary.brief ?? null, cached: true };
  }

  const kpis = await crossBotKpis();
  let brief: string | null = null;
  try {
    brief = await claudeText({
      system:
        "אתה אנליסט תפעול. סכם בעברית ב-3 עד 5 נקודות קצרות את ה-KPI של כל הבוטים היום, והדגש כל דבר שדורש תשומת לב.",
      prompt: JSON.stringify(kpis),
      maxTokens: 400,
    });
  } catch {
    brief = null; // AI not configured / transient — KPIs still useful
  }

  const summary = { kpis, brief };
  await runSql(
    cp,
    `insert into botops.digests (date, scope, summary)
       values (${sqlString(date)}::date, 'all', ${sqlString(JSON.stringify(summary))}::jsonb)
     on conflict (date, scope) do update set summary = excluded.summary`
  ).catch(() => {});

  return { kpis, brief, cached: false };
}
