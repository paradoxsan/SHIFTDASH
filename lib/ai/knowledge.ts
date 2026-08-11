// ── Client dossier (migration 0012) ───────────────────────────────────────────
// The durable knowledge behind a per-client agent: how that client's bot is
// wired, what has broken before, how the business actually works. Stored per
// TENANT but read per BOT SLUG, because the slug is what the whole UI keys on
// — same split as lib/contracts.ts.
//
// This is the half of "context" that tools cannot fetch. n8n can tell the agent
// a workflow is off; only the dossier can tell it that this particular workflow
// is off every Shabbat on purpose.
import { runSql } from "../supabase-management";
import { controlPlaneRef } from "../control-plane";
import { sqlString } from "../sql";

const cp = () => controlPlaneRef();

export const KNOWLEDGE_KINDS = [
  "architecture",
  "incident",
  "business_rule",
  "contact",
  "ops",
] as const;

export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];
export type KnowledgeSource = "seed" | "human" | "agent";

/** Hebrew section headings for the prompt and the dashboard panel. */
export const KIND_LABELS: Record<KnowledgeKind, string> = {
  architecture: "איך הבוט בנוי",
  business_rule: "כללי העסק",
  ops: "תפעול ונהלים",
  incident: "תקלות שהיו",
  contact: "אנשי קשר",
};

/** Prompt order — how the bot works before what broke, so the agent reads the
 *  system before the symptoms. Not the same as KNOWLEDGE_KINDS' storage order. */
const KIND_ORDER: KnowledgeKind[] = [
  "architecture",
  "business_rule",
  "ops",
  "incident",
  "contact",
];

export interface KnowledgeEntry {
  id: number;
  tenantId: string;
  kind: KnowledgeKind;
  title: string;
  body: string;
  source: KnowledgeSource;
  pinned: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface KnowledgeRow {
  id: number | string;
  tenant_id: string;
  kind: string;
  title: string;
  body: string;
  source: string;
  pinned: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function toEntry(r: KnowledgeRow): KnowledgeEntry {
  return {
    id: Number(r.id),
    tenantId: r.tenant_id,
    kind: r.kind as KnowledgeKind,
    title: r.title,
    body: r.body,
    source: r.source as KnowledgeSource,
    pinned: r.pinned,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT_COLS =
  "k.id, k.tenant_id, k.kind, k.title, k.body, k.source, k.pinned, k.created_by, k.created_at, k.updated_at";

/** Dossier for one tenant, pinned first then most-recently-updated. */
export async function listKnowledge(tenantId: string): Promise<KnowledgeEntry[]> {
  const rows = await runSql<KnowledgeRow>(
    cp(),
    `select ${SELECT_COLS}
       from botops.client_knowledge k
      where k.tenant_id = ${sqlString(tenantId)}::uuid
      order by k.pinned desc, k.updated_at desc`
  );
  return rows.map(toEntry);
}

/** Dossier addressed the way the UI and the tools address a client. */
export async function knowledgeForSlug(slug: string): Promise<KnowledgeEntry[]> {
  const rows = await runSql<KnowledgeRow>(
    cp(),
    `select ${SELECT_COLS}
       from botops.client_knowledge k
       join botops.bots b on b.tenant_id = k.tenant_id
      where b.slug = ${sqlString(slug)}
      order by k.pinned desc, k.updated_at desc`
  );
  return rows.map(toEntry);
}

/** How many dossier entries each client has, keyed by bot slug — the badge on
 *  the agent picker, so an empty dossier is visible rather than assumed full. */
export async function knowledgeCountsBySlug(): Promise<Record<string, number>> {
  const rows = await runSql<{ slug: string; n: number | string }>(
    cp(),
    `select b.slug, count(k.id) as n
       from botops.bots b
       left join botops.client_knowledge k on k.tenant_id = b.tenant_id
      where b.status <> 'archived'
      group by b.slug`
  );
  return Object.fromEntries(rows.map((r) => [r.slug, Number(r.n)]));
}

export interface NewKnowledge {
  kind: KnowledgeKind;
  title: string;
  body: string;
  source?: KnowledgeSource;
  pinned?: boolean;
  createdBy?: string | null;
}

/**
 * Append an entry. Seed rows upsert on (tenant, title) so re-running an import
 * refreshes rather than duplicates; human/agent rows always insert, because two
 * incidents can legitimately share a title.
 *
 * NOT audited here on purpose — the caller wraps this in auditedMutation so RBAC
 * and the audit row are enforced at one boundary (see lib/services/audited.ts).
 */
export async function addKnowledge(tenantId: string, entry: NewKnowledge): Promise<number> {
  const source = entry.source ?? "human";
  const conflict =
    source === "seed"
      ? `on conflict (tenant_id, title) where source = 'seed'
           do update set body = excluded.body, kind = excluded.kind, updated_at = now()`
      : "";

  const rows = await runSql<{ id: number | string }>(
    cp(),
    `insert into botops.client_knowledge (tenant_id, kind, title, body, source, pinned, created_by)
       values (${sqlString(tenantId)}::uuid, ${sqlString(entry.kind)}, ${sqlString(entry.title)},
               ${sqlString(entry.body)}, ${sqlString(source)}, ${entry.pinned ? "true" : "false"},
               ${entry.createdBy ? sqlString(entry.createdBy) : "null"})
     ${conflict}
     returning id`
  );
  return Number(rows[0]?.id ?? 0);
}

export interface KnowledgePatch {
  kind?: KnowledgeKind;
  title?: string;
  body?: string;
  pinned?: boolean;
}

export async function updateKnowledge(id: number, patch: KnowledgePatch): Promise<void> {
  const cols: string[] = [];
  if (patch.kind !== undefined) cols.push(`kind = ${sqlString(patch.kind)}`);
  if (patch.title !== undefined) cols.push(`title = ${sqlString(patch.title)}`);
  if (patch.body !== undefined) cols.push(`body = ${sqlString(patch.body)}`);
  if (patch.pinned !== undefined) cols.push(`pinned = ${patch.pinned ? "true" : "false"}`);
  if (cols.length === 0) return;

  await runSql(
    cp(),
    `update botops.client_knowledge
        set ${cols.join(", ")}, updated_at = now()
      where id = ${Math.floor(id)}`
  );
}

export async function deleteKnowledge(id: number): Promise<void> {
  await runSql(cp(), `delete from botops.client_knowledge where id = ${Math.floor(id)}`);
}

// ── Prompt rendering ──────────────────────────────────────────────────────────

/**
 * Character budget for the dossier inside the system prompt. Generous — the
 * whole point of the feature is that the agent starts a debug session already
 * knowing — but bounded, because a client with fifty incidents would otherwise
 * push the live snapshot and the user's actual question out of the model's
 * attention.
 */
export const DOSSIER_BUDGET = 12_000;

/**
 * The dossier as prompt text, grouped by kind.
 *
 * Trimming order is the whole reason this is not a naive join: entries are
 * dropped OLDEST-FIRST and pinned entries are never dropped, so the fact that
 * has been load-bearing since setup survives a flood of recent incidents. What
 * was dropped is stated in the output rather than silently omitted — an agent
 * that knows its dossier is truncated can ask for the rest via a tool; one that
 * doesn't will confidently answer from a partial history.
 */
export function renderDossier(entries: KnowledgeEntry[], budget = DOSSIER_BUDGET): string {
  if (entries.length === 0) return "";

  // Pinned first, then newest — the order entries survive trimming in.
  const ranked = [...entries].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  const kept: KnowledgeEntry[] = [];
  let used = 0;
  let dropped = 0;
  for (const e of ranked) {
    const cost = e.title.length + e.body.length + 8;
    if (used + cost > budget && !e.pinned) {
      dropped++;
      continue;
    }
    kept.push(e);
    used += cost;
  }

  const sections = KIND_ORDER.map((kind) => {
    const group = kept.filter((e) => e.kind === kind);
    if (group.length === 0) return "";
    const lines = group.map((e) => `• ${e.title}\n  ${e.body.replace(/\n/g, "\n  ")}`);
    return `### ${KIND_LABELS[kind]}\n${lines.join("\n")}`;
  }).filter(Boolean);

  if (dropped > 0) {
    sections.push(
      `_(${dropped} רשומות ישנות יותר לא נכללו כאן מטעמי אורך — יש עוד היסטוריה בתיק הלקוח.)_`
    );
  }

  return sections.join("\n\n");
}
