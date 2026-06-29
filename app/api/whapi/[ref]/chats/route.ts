import { ok, fail } from "@/lib/api-helpers";
import { listChats } from "@/lib/whapi";
import { campaignChatIds } from "@/lib/campaign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const { ref } = await params;
    const chats = await listChats(ref);
    // Campaign bots (a project with a `campaign_contacts` allowlist) show ONLY
    // the chats that came in from the ad — never the phone's personal/existing
    // chats. Other projects return everything (allow = null).
    const allow = await campaignChatIds(ref);
    const shown = allow ? chats.filter((c) => allow.has(c.id)) : chats;
    return ok({ chats: shown, campaignOnly: Boolean(allow), total: chats.length });
  } catch (e) {
    return fail(e);
  }
}
