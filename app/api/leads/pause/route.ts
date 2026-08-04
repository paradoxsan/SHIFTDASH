import { ok, fail } from "@/lib/api-helpers";
import { setBotPause } from "@/lib/sdr-control";
import { getCurrentUser } from "@/lib/current-user";
import { auditedMutation } from "@/lib/services/audited";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      phone?: string;
      paused?: boolean;
      minutes?: number;
    };
    if (!body.phone || typeof body.paused !== "boolean") {
      return fail(new Error("phone and paused(boolean) are required"), 400);
    }
    const phone = body.phone;
    const paused = body.paused;
    const actor = await getCurrentUser(req);
    await auditedMutation(
      {
        actor,
        minRole: "operator",
        action: "leads.bot.pause",
        targetType: "lead",
        targetId: phone,
        payload: { paused, minutes: body.minutes },
      },
      () => setBotPause(phone, paused, body.minutes)
    );
    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
