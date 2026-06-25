import { ok, fail } from "@/lib/api-helpers";
import { listChats } from "@/lib/whapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const { ref } = await params;
    return ok({ chats: await listChats(ref) });
  } catch (e) {
    return fail(e);
  }
}
