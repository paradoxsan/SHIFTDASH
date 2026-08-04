import { ok, fail } from "@/lib/api-helpers";
import { introspect } from "@/lib/services/data-plane";
import { listQueue } from "@/lib/services/operator";
import { assertKnownRef } from "@/lib/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Failed / stuck inbox queue for an operator to requeue. Read-only.
export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const { ref } = await params;
    assertKnownRef(ref);
    const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit") ?? 50), 1), 200);

    const schema = await introspect(ref);
    const inbox = schema.tables["inbox"] ?? [];
    const supported = schema.tableNames.includes("inbox") && inbox.some((c) => c.name === "status");
    if (!supported) return ok({ supported: false, items: [] });

    return ok({ supported: true, items: await listQueue(ref, { limit }) });
  } catch (e) {
    return fail(e);
  }
}
