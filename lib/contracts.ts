// ── Client contracts (control-plane, Phase 3) ─────────────────────────────────
// What each client agreed to pay me. Stored per TENANT (see migration 0011) but
// read per BOT SLUG, because the slug is what the whole UI already keys on.
import { runSql } from "./supabase-management";
import { controlPlaneRef } from "./control-plane";
import { sqlString } from "./sql";
import type { ContractLike } from "./billing";

const cp = () => controlPlaneRef();

export type BillingStatus = "active" | "paused" | "churned";

export interface Contract extends ContractLike {
  tenantId: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  startedOn: string | null;
  setupFee: number | null;
  monthlyFee: number | null;
  currency: string;
  billingStatus: BillingStatus;
  morningClientId: string | null;
  notes: string | null;
  updatedAt: string | null;
}

interface ContractSqlRow {
  slug: string;
  tenant_id: string;
  /** False when the LEFT JOIN found no agreement for this tenant. */
  has_contract: boolean;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  started_on: string | null;
  setup_fee: string | number | null;
  monthly_fee: string | number | null;
  currency: string | null;
  billing_status: string | null;
  morning_client_id: string | null;
  notes: string | null;
  updated_at: string | null;
}

/** Postgres `numeric` comes back over the SQL endpoint as a string. */
function num(v: string | number | null): number | null {
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toContract(r: ContractSqlRow): Contract {
  return {
    tenantId: r.tenant_id,
    contactName: r.contact_name,
    contactPhone: r.contact_phone,
    contactEmail: r.contact_email,
    startedOn: r.started_on ? String(r.started_on).slice(0, 10) : null,
    setupFee: num(r.setup_fee),
    monthlyFee: num(r.monthly_fee),
    currency: r.currency ?? "ILS",
    billingStatus: (r.billing_status as BillingStatus) ?? "active",
    morningClientId: r.morning_client_id,
    notes: r.notes,
    updatedAt: r.updated_at,
  };
}

/**
 * Every live bot's contract, keyed by bot slug. A bot with no agreement recorded
 * yet maps to null rather than being dropped — "no contract" is a state the
 * client card must be able to show, and nudge me to fix.
 */
export async function listContractsBySlug(): Promise<Record<string, Contract | null>> {
  const rows = await runSql<ContractSqlRow>(
    cp(),
    `select b.slug, t.id as tenant_id, (c.tenant_id is not null) as has_contract,
            c.contact_name, c.contact_phone, c.contact_email, c.started_on,
            c.setup_fee, c.monthly_fee, c.currency, c.billing_status,
            c.morning_client_id, c.notes, c.updated_at
       from botops.bots b
       join botops.tenants t on t.id = b.tenant_id
       left join botops.client_contracts c on c.tenant_id = t.id
      where b.status <> 'archived' and t.status <> 'archived'
      order by b.slug`
  );
  return Object.fromEntries(rows.map((r) => [r.slug, r.has_contract ? toContract(r) : null]));
}

export async function getContractBySlug(slug: string): Promise<Contract | null> {
  const all = await listContractsBySlug();
  return all[slug] ?? null;
}

/** The tenant a bot slug belongs to — the write key for its contract. */
export async function tenantIdForSlug(slug: string): Promise<string | null> {
  const rows = await runSql<{ tenant_id: string }>(
    cp(),
    `select tenant_id from botops.bots where slug = ${sqlString(slug)} limit 1`
  );
  return rows[0]?.tenant_id ?? null;
}

export interface ContractPatch {
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  startedOn?: string | null;
  setupFee?: number | null;
  monthlyFee?: number | null;
  currency?: string;
  billingStatus?: BillingStatus;
  morningClientId?: string | null;
  notes?: string | null;
}

function lit(v: string | null | undefined): string {
  return v === null || v === undefined || v === "" ? "null" : sqlString(v);
}
function numLit(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "null" : String(v);
}
function dateLit(v: string | null | undefined): string {
  return v === null || v === undefined || v === "" ? "null" : `${sqlString(v)}::date`;
}

/**
 * Create or update a contract. Only the keys present in `patch` change — the
 * client card saves one section at a time, and a partial save must not wipe the
 * fields it didn't render.
 *
 * NOT audited here on purpose: the caller wraps this in auditedMutation so RBAC
 * and the audit row are enforced at the one boundary (see lib/services/audited.ts).
 */
export async function upsertContract(tenantId: string, patch: ContractPatch): Promise<void> {
  const cols: Array<[string, string]> = [];
  const has = <K extends keyof ContractPatch>(k: K): boolean =>
    Object.prototype.hasOwnProperty.call(patch, k);

  if (has("contactName")) cols.push(["contact_name", lit(patch.contactName)]);
  if (has("contactPhone")) cols.push(["contact_phone", lit(patch.contactPhone)]);
  if (has("contactEmail")) cols.push(["contact_email", lit(patch.contactEmail)]);
  if (has("startedOn")) cols.push(["started_on", dateLit(patch.startedOn)]);
  if (has("setupFee")) cols.push(["setup_fee", numLit(patch.setupFee)]);
  if (has("monthlyFee")) cols.push(["monthly_fee", numLit(patch.monthlyFee)]);
  if (has("currency")) cols.push(["currency", lit(patch.currency)]);
  if (has("billingStatus")) cols.push(["billing_status", lit(patch.billingStatus)]);
  if (has("morningClientId")) cols.push(["morning_client_id", lit(patch.morningClientId)]);
  if (has("notes")) cols.push(["notes", lit(patch.notes)]);

  if (cols.length === 0) return;

  const names = ["tenant_id", ...cols.map(([c]) => c)].join(", ");
  const values = [`${sqlString(tenantId)}::uuid`, ...cols.map(([, v]) => v)].join(", ");
  const updates = [...cols.map(([c]) => `${c} = excluded.${c}`), "updated_at = now()"].join(", ");

  await runSql(
    cp(),
    `insert into botops.client_contracts (${names})
       values (${values})
     on conflict (tenant_id) do update set ${updates}`
  );
}
