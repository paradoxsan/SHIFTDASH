import { ok, fail } from "@/lib/api-helpers";
import { greenSendMessage } from "@/lib/green-api";
import { setBotPause } from "@/lib/sdr-control";

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
    // Sending a manual message means a human is handling this lead → pause the
    // bot so it doesn't reply on top of you (default 2h, auto-expires).
    const pauseMinutes = body.pauseMinutes ?? 120;
    try {
      await setBotPause(body.phone, true, pauseMinutes);
    } catch {
      /* non-fatal: still send even if the pause webhook hiccups */
    }
    const result = await greenSendMessage(body.phone, body.message);
    return ok({ ok: true, ...result });
  } catch (e) {
    return fail(e);
  }
}
