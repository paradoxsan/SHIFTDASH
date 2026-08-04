import { ok, fail } from "@/lib/api-helpers";
import { greenSendMessage } from "@/lib/green-api";
import { setBotPause } from "@/lib/sdr-control";
import { getCurrentUser } from "@/lib/current-user";
import { auditedMutation } from "@/lib/services/audited";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      phone?: string;
      message?: string;
      pauseMinutes?: number;
    };
    if (!body.phone || !body.message) {
      return fail(new Error("phone and message are required"), 400);
    }
    const phone = body.phone;
    const message = body.message;
    const pauseMinutes = body.pauseMinutes ?? 120;
    const actor = await getCurrentUser(req);
    const result = await auditedMutation(
      {
        actor,
        minRole: "operator",
        action: "leads.send",
        targetType: "lead",
        targetId: phone,
        payload: { pauseMinutes, length: message.length },
      },
      async () => {
        // Manual message => a human is handling => pause the bot (auto-expires).
        try {
          await setBotPause(phone, true, pauseMinutes);
        } catch {
          /* non-fatal: still send even if the pause webhook hiccups */
        }
        return greenSendMessage(phone, message);
      }
    );
    return ok({ ok: true, ...result });
  } catch (e) {
    return fail(e);
  }
}
