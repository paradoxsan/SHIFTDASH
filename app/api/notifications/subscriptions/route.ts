import { ok, fail, parseBody } from "@/lib/api-helpers";
import { listSubscriptions, createSubscription } from "@/lib/events";
import { auditedMutation } from "@/lib/services/audited";
import { getCurrentUser } from "@/lib/current-user";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const subSchema = z.object({
  channel: z.enum(["web_push", "telegram", "email", "log"]),
  target: z.string().max(500).optional(),
  eventTypes: z.array(z.string()).optional(),
  minSeverity: z.enum(["info", "low", "medium", "high", "critical"]).optional(),
});

export async function GET() {
  try {
    return ok({ subscriptions: await listSubscriptions() });
  } catch (e) {
    return fail(e);
  }
}

// Create a notification subscription for the current user. Audited (operator).
export async function POST(req: Request) {
  try {
    const parsed = await parseBody(req, subSchema);
    if (!parsed.ok) return parsed.res;
    const actor = await getCurrentUser(req);
    await auditedMutation(
      { actor, minRole: "operator", action: "notification.subscribe", targetType: "subscription", payload: parsed.data },
      () => createSubscription({ userEmail: actor?.email ?? null, ...parsed.data })
    );
    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
