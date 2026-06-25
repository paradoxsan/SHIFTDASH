// Adaptive CRM: surfaces a client's primary business pipeline. If the client's
// Supabase project has a `leads` table → lead pipeline (the agency SDR). If it
// has `orders` → orders funnel (e.g. T center). Otherwise there's no Supabase
// CRM (e.g. BRJewelry lives in a Google Sheet) and we return kind "none".
import { introspect, runSql } from "./supabase-management";
import type { ClientDef } from "./registry";
import type { CrmPayload } from "./types";

const LEAD_STATUSES = ["new", "contacted", "appointment_set", "showed_up", "won", "lost"];
const ORDER_STATUSES = ["open", "paid", "cancelled", "superseded"];

const LEAD_FIELDS = [
  "id",
  "full_name",
  "phone",
  "status",
  "business_type",
  "services_required",
  "appointment_at",
  "lead_source",
  "created_at",
  "updated_at",
];
const ORDER_FIELDS = [
  "id",
  "chat_id",
  "invoice_name",
  "total",
  "status",
  "payment_link",
  "created_at",
  "updated_at",
];

export async function getCrm(c: ClientDef, allowTables: string[]): Promise<CrmPayload> {
  const schema = await introspect(c.supabaseRef);
  const has = (t: string) => allowTables.includes(t) && schema.tableNames.includes(t);

  const build = async (
    table: "leads" | "orders",
    fields: string[],
    statuses: string[],
    hasTotalCol: boolean
  ): Promise<CrmPayload> => {
    const cols = schema.tables[table].map((x) => x.name);
    const sel = fields.filter((f) => cols.includes(f));
    const orderBy = cols.includes("created_at") ? "created_at" : sel[0];
    const records = await runSql<Record<string, unknown>>(
      c.supabaseRef,
      `select ${sel.map((s) => `"${s}"`).join(", ")} from public."${table}"
       order by "${orderBy}" desc nulls last limit 500`
    );
    return {
      kind: table,
      table,
      pk: schema.pks[table]?.[0] ?? "id",
      statuses,
      records,
      hasTotal: hasTotalCol && cols.includes("total"),
    };
  };

  if (has("leads")) return build("leads", LEAD_FIELDS, LEAD_STATUSES, false);
  if (has("orders")) return build("orders", ORDER_FIELDS, ORDER_STATUSES, true);
  return { kind: "none", table: null, pk: null, statuses: [], records: [], hasTotal: false };
}
