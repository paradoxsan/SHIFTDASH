// Read and save one client's agreement: contact details, fees, and the Morning
// link that makes "did they pay" answerable.
import { ok, fail, parseBody } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/current-user";
import { requireRole } from "@/lib/rbac";
import { auditedMutation } from "@/lib/services/audited";
import { getContractBySlug, tenantIdForSlug, upsertContract } from "@/lib/contracts";
import { contractPatchSchema } from "@/lib/validation/contract";
import { loadClients } from "@/lib/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function assertKnownClient(slug: string): Promise<void> {
  const clients = await loadClients();
  if (!clients.some((c) => c.id === slug)) throw new Error(`Unknown client: ${slug}`);
}

export async function GET(req: Request, { params }: { params: Promise<{ client: string }> }) {
  try {
    const { client } = await params;
    const actor = await getCurrentUser(req);
    requireRole(actor?.role, "viewer");
    await assertKnownClient(client);
    return ok({ contract: await getContractBySlug(client) });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ client: string }> }) {
  try {
    const { client } = await params;
    await assertKnownClient(client);

    const parsed = await parseBody(req, contractPatchSchema);
    if (!parsed.ok) return parsed.res;

    const tenantId = await tenantIdForSlug(client);
    if (!tenantId) return fail(new Error(`No tenant for client: ${client}`), 404);

    const actor = await getCurrentUser(req);
    await auditedMutation(
      {
        actor,
        // Fees and the Morning link are business terms — operator is not enough.
        minRole: "owner",
        action: "client.contract.save",
        targetType: "client",
        targetId: client,
        payload: parsed.data,
      },
      () => upsertContract(tenantId, parsed.data)
    );

    return ok({ contract: await getContractBySlug(client) });
  } catch (e) {
    return fail(e);
  }
}
