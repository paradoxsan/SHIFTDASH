import { ok, fail, parseBody } from "@/lib/api-helpers";
import { listEvents, setEventStatus } from "@/lib/events";
import { auditedMutation } from "@/lib/services/audited";
import { getCurrentUser } from "@/lib/current-user";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const eventActionSchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(["ack", "resolve"]),
});

// List events (optionally by status).
export async function GET(req: Request) {
  try {
    const status = new URL(req.url).searchParams.get("status") ?? undefined;
    return ok({ events: await listEvents({ status, limit: 200 }) });
  } catch (e) {
    return fail(e);
  }
}

// Ack or resolve an event. Audited (operator).
export async function POST(req: Request) {
  try {
    const parsed = await parseBody(req, eventActionSchema);
    if (!parsed.ok) return parsed.res;
    const { id, action } = parsed.data;
    const actor = await getCurrentUser(req);
    await auditedMutation(
      { actor, minRole: "operator", action: `event.${action}`, targetType: "dashboard_event", targetId: String(id) },
      () => setEventStatus(id, action === "ack" ? "ack" : "resolved")
    );
    return ok({ ok: true });
  } catch (e) {
    return fail(e); // ForbiddenError → 403
  }
}
