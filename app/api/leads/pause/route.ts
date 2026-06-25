import { ok, fail } from "@/lib/api-helpers";
import { setBotPause } from "@/lib/sdr-control";

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
    await setBotPause(body.phone, body.paused, body.minutes);
    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
