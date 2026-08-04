import { ok, fail } from "@/lib/api-helpers";
import { getClient } from "@/lib/registry";
import { introspect } from "@/lib/supabase-management";
import { getHumanMode, setHumanMode } from "@/lib/human-mode";
import { getCurrentUser } from "@/lib/current-user";
import { auditedMutation } from "@/lib/services/audited";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveClient(clientId: string) {
  const c = getClient(clientId);
  if (!c) throw new Error(`Unknown client: ${clientId}`);
  const schema = await introspect(c.supabaseRef);
  if (!schema.tableNames.includes("human_mode")) {
    throw new Error("ללקוח הזה אין טבלת human_mode (אין שליטת בוט פר-שיחה)");
  }
  return c;
}

export async function GET(req: Request, { params }: { params: Promise<{ client: string }> }) {
  try {
    const { client } = await params;
    const c = await resolveClient(client);
    const chatId = new URL(req.url).searchParams.get("chatId");
    if (!chatId) return fail(new Error("chatId required"), 400);
    return ok(await getHumanMode(c.supabaseRef, chatId));
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ client: string }> }) {
  try {
    const { client } = await params;
    const c = await resolveClient(client);
    const body = (await req.json().catch(() => ({}))) as {
      chatId?: string;
      active?: boolean;
      silenceMinutes?: number;
    };
    if (!body.chatId || typeof body.active !== "boolean") {
      return fail(new Error("chatId and active(boolean) required"), 400);
    }
    const chatId = body.chatId;
    const active = body.active;
    const actor = await getCurrentUser(req);
    const out = await auditedMutation(
      {
        actor,
        minRole: "operator",
        action: "client.human_mode.set",
        targetType: `${client}.chat`,
        targetId: chatId,
        payload: { active, silenceMinutes: body.silenceMinutes },
      },
      () => setHumanMode(c.supabaseRef, chatId, active, body.silenceMinutes)
    );
    return ok(out);
  } catch (e) {
    return fail(e);
  }
}
