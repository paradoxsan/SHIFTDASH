import { ok, fail } from "@/lib/api-helpers";
import { sendText } from "@/lib/whapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const { ref } = await params;
    const body = (await req.json().catch(() => ({}))) as { to?: string; body?: string };
    if (!body.to || !body.body) return fail(new Error("to and body are required"), 400);
    return ok(await sendText(ref, body.to, body.body));
  } catch (e) {
    return fail(e);
  }
}
