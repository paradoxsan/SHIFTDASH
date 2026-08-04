// ── BotOps control-plane reader (Phase 2) ─────────────────────────────────────
// The control-plane is the `botops` schema. Option B hosts it inside an existing
// project, so it is reached via the Management SQL endpoint (PostgREST only
// exposes `public`). Moving it to a dedicated project later changes only
// CONTROL_PLANE_REF (and, eventually, the access method) — not callers.
import { env } from "./env";
import { runSql } from "./supabase-management";
import { sqlString } from "./sql";

export interface BotRow {
  slug: string;
  name: string;
  workspace: "mine" | "clients";
  supabase_ref: string;
  table_include: string[];
  table_exclude: string[];
  n8n_prefixes: string[];
  whapi_key: string | null;
  sheet_id: string | null;
  channel: string | null;
  accent: string | null;
}

export function controlPlaneRef(): string {
  return env.controlPlaneRef();
}

/** Load all live bots (joined to their tenant) from the control-plane. */
export async function loadBotRows(): Promise<BotRow[]> {
  return runSql<BotRow>(
    controlPlaneRef(),
    `select b.slug, b.name, t.workspace, b.supabase_ref,
            b.table_include, b.table_exclude, b.n8n_prefixes,
            b.whapi_key, b.sheet_id, b.channel, t.accent
       from botops.bots b
       join botops.tenants t on t.id = b.tenant_id
      where b.status <> 'archived' and t.status <> 'archived'
      order by t.workspace, b.slug`
  );
}

// ── App users (BotOps Phase 3 — identity/RBAC) ────────────────────────────────
export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  role: "owner" | "operator" | "viewer";
  status: string;
}

export async function getUserByEmail(email: string): Promise<AppUser | null> {
  const rows = await runSql<AppUser>(
    controlPlaneRef(),
    `select id, email, name, role, status from botops.app_users
      where lower(email) = lower(${sqlString(email)}) limit 1`
  );
  return rows[0] ?? null;
}

/** Insert a user (default role applied only on first sight) or stamp last_login.
 *  Existing roles are NEVER downgraded here — manual role changes persist. */
export async function upsertUser(
  email: string,
  role: "owner" | "operator" | "viewer",
  name?: string
): Promise<void> {
  await runSql(
    controlPlaneRef(),
    `insert into botops.app_users (email, role, name, last_login)
       values (${sqlString(email)}, ${sqlString(role)}, ${name ? sqlString(name) : "null"}, now())
     on conflict (email) do update
       set last_login = now(),
           name = coalesce(excluded.name, botops.app_users.name)`
  );
}

export async function listUsers(): Promise<AppUser[]> {
  return runSql<AppUser>(
    controlPlaneRef(),
    `select id, email, name, role, status from botops.app_users order by email`
  );
}

// ── Bot identity (BotOps Phase 8 — events need the bot UUID, not the slug) ─────
export interface BotIdentity {
  id: string; // bot uuid
  slug: string;
  tenant_id: string;
}
export async function listBotIdentity(): Promise<BotIdentity[]> {
  return runSql<BotIdentity>(
    controlPlaneRef(),
    `select id, slug, tenant_id from botops.bots where status <> 'archived'`
  );
}

// ── Bot templates (BotOps Phase 6) ────────────────────────────────────────────
export interface BotTemplateRow {
  id: string;
  name: string;
  version: number;
  source_workflow_id: string | null;
  required_secrets: string[];
  required_config: string[];
  prompt_token: string | null;
  credentials: string[];
}

export async function listBotTemplates(): Promise<BotTemplateRow[]> {
  return runSql<BotTemplateRow>(
    controlPlaneRef(),
    `select id, name, version, source_workflow_id, required_secrets, required_config, prompt_token, credentials
       from botops.bot_templates order by id`
  );
}

/** Has this exact action+target succeeded within the last `withinMinutes`? Used
 *  as an audit-log-backed cooldown (e.g. don't re-chase the same order). */
export async function wasActionedRecently(
  action: string,
  targetType: string,
  targetId: string,
  withinMinutes: number
): Promise<boolean> {
  const rows = await runSql<{ n: number }>(
    controlPlaneRef(),
    `select count(*)::int n from botops.audit_log
      where action = ${sqlString(action)}
        and target_type = ${sqlString(targetType)}
        and target_id = ${sqlString(targetId)}
        and result = 'ok'
        and created_at > now() - interval '${Math.max(1, Math.floor(withinMinutes))} minutes'`
  );
  return Number(rows[0]?.n ?? 0) > 0;
}
