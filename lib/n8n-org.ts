// ── Business-level n8n organization (BotOps onboarding rule) ──────────────────
// Requirement: every new bot takes the BUSINESS NAME first and lands in an
// organized container in n8n, so n8n + Supabase + the dashboard stay aligned
// per business.
//
// Reality of THIS n8n instance (probed live): the license does NOT allow
// projects (/projects → 403) and the public API has no folders (/folders → 404).
// The achievable, API-backed grouping primitive is TAGS (/tags → 200) plus a
// "<Business> — <Bot>" workflow naming convention (which also feeds the
// dashboard's prefix grouping). When the instance later gains folder support,
// botops.tenants.n8n_folder_id takes over and only ensureBusinessContainer()
// changes — callers and the data model do not.
import { env } from "./env";

/** Deterministic display label / tag name / workflow prefix for a business. */
export function businessOrgLabel(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** Canonical workflow name for a business's bot: "<Business> — <Bot>". */
export function businessWorkflowName(business: string, bot: string): string {
  return `${businessOrgLabel(business)} — ${bot.trim()}`;
}

export interface N8nTag {
  id: string;
  name: string;
}

function n8nHeaders(): HeadersInit {
  return {
    "X-N8N-API-KEY": env.n8nApiKey(),
    accept: "application/json",
    "content-type": "application/json",
  };
}

/**
 * Locate-or-create the business's n8n tag (idempotent — Fix D style). Returns
 * the tag. This is the provisioning-time "make the business folder" step on the
 * current license; it is intentionally NOT auto-run here — the Phase 7
 * onboarding pipeline calls it (audited) when a bot is created.
 */
export async function ensureBusinessTag(business: string): Promise<N8nTag> {
  const base = env.n8nBaseUrl();
  const label = businessOrgLabel(business);

  const list = await fetch(`${base}/api/v1/tags?limit=250`, { headers: n8nHeaders(), cache: "no-store" });
  if (!list.ok) throw new Error(`n8n tags list failed ${list.status}: ${await list.text()}`);
  const existing = ((await list.json()).data as N8nTag[]).find((t) => t.name === label);
  if (existing) return existing;

  const created = await fetch(`${base}/api/v1/tags`, {
    method: "POST",
    headers: n8nHeaders(),
    body: JSON.stringify({ name: label }),
  });
  if (!created.ok) throw new Error(`n8n tag create failed ${created.status}: ${await created.text()}`);
  return (await created.json()) as N8nTag;
}
