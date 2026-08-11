// A client's dossier: what its dedicated agent knows. Read by the dashboard
// panel, written by the operator. The agent's own writes come through the
// remember_about_client tool, which lands in the same table behind the approval
// gate — this route is the human path to the same store.
import { z } from "zod";
import { ok, fail, parseBody } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/current-user";
import { requireRole } from "@/lib/rbac";
import { auditedMutation } from "@/lib/services/audited";
import { loadClients, getClient } from "@/lib/registry";
import { tenantIdForSlug } from "@/lib/contracts";
import {
  KNOWLEDGE_KINDS,
  addKnowledge,
  listKnowledge,
  updateKnowledge,
  deleteKnowledge,
} from "@/lib/ai/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resolve a bot slug to its tenant, rejecting anything not in the registry. */
async function resolve(client: string): Promise<string> {
  await loadClients();
  if (!getClient(client)) throw new Error(`לקוח לא מוכר: ${client}`);
  const tenantId = await tenantIdForSlug(client);
  if (!tenantId) throw new Error(`ללקוח ${client} אין רשומה ב-control-plane`);
  return tenantId;
}

export async function GET(req: Request, { params }: { params: Promise<{ client: string }> }) {
  try {
    const actor = await getCurrentUser(req);
    requireRole(actor?.role, "viewer");
    const { client } = await params;
    return ok({ entries: await listKnowledge(await resolve(client)) });
  } catch (e) {
    return fail(e);
  }
}

const createSchema = z.object({
  kind: z.enum(KNOWLEDGE_KINDS),
  title: z.string().min(3).max(120),
  body: z.string().min(1).max(4000),
  pinned: z.boolean().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ client: string }> }) {
  try {
    const parsed = await parseBody(req, createSchema);
    if (!parsed.ok) return parsed.res;

    const actor = await getCurrentUser(req);
    const { client } = await params;
    const tenantId = await resolve(client);

    const id = await auditedMutation(
      {
        actor,
        minRole: "operator",
        action: "client_knowledge.add",
        targetType: "client",
        targetId: client,
        payload: { kind: parsed.data.kind, title: parsed.data.title },
      },
      () =>
        addKnowledge(tenantId, {
          ...parsed.data,
          source: "human",
          createdBy: actor?.email ?? null,
        })
    );
    return ok({ id });
  } catch (e) {
    return fail(e);
  }
}

const patchSchema = z.object({
  id: z.number().int().positive(),
  kind: z.enum(KNOWLEDGE_KINDS).optional(),
  title: z.string().min(3).max(120).optional(),
  body: z.string().min(1).max(4000).optional(),
  pinned: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ client: string }> }) {
  try {
    const parsed = await parseBody(req, patchSchema);
    if (!parsed.ok) return parsed.res;

    const actor = await getCurrentUser(req);
    const { client } = await params;
    await resolve(client);
    const { id, ...patch } = parsed.data;

    await auditedMutation(
      {
        actor,
        minRole: "operator",
        action: "client_knowledge.update",
        targetType: "client",
        targetId: client,
        payload: { id, ...patch },
      },
      () => updateKnowledge(id, patch)
    );
    return ok({ updated: true });
  } catch (e) {
    return fail(e);
  }
}

const deleteSchema = z.object({ id: z.number().int().positive() });

export async function DELETE(req: Request, { params }: { params: Promise<{ client: string }> }) {
  try {
    const parsed = await parseBody(req, deleteSchema);
    if (!parsed.ok) return parsed.res;

    const actor = await getCurrentUser(req);
    const { client } = await params;
    await resolve(client);

    await auditedMutation(
      {
        actor,
        minRole: "operator",
        action: "client_knowledge.delete",
        targetType: "client",
        targetId: client,
        payload: { id: parsed.data.id },
      },
      () => deleteKnowledge(parsed.data.id)
    );
    return ok({ deleted: true });
  } catch (e) {
    return fail(e);
  }
}
