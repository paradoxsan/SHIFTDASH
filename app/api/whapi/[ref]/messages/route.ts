import { ok, fail } from "@/lib/api-helpers";
import { listMessages } from "@/lib/whapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const { ref } = await params;
    const chatId = new URL(req.url).searchParams.get("chatId");
    if (!chatId) return fail(new Error("chatId query param required"), 400);
    return ok({ messages: await listMessages(ref, chatId) });
  } catch (e) {
    return fail(e);
  }
}
