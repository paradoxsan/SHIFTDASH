import { ok, fail } from "@/lib/api-helpers";
import { getClient, clientTables } from "@/lib/registry";
import { introspect } from "@/lib/supabase-management";
import { getCrm } from "@/lib/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ client: string }> }) {
  try {
    const { client } = await params;
    const c = getClient(client);
    if (!c) return fail(new Error(`Unknown client: ${client}`), 404);
    const schema = await introspect(c.supabaseRef);
    const allow = clientTables(c, schema.tableNames);
    return ok(await getCrm(c, allow));
  } catch (e) {
    return fail(e);
  }
}
