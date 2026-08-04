// Rehydrate a thread for the UI: the visible transcript plus any proposal still
// waiting on a decision, so a page reload doesn't strand an approval card.
import { ok, fail } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/current-user";
import { requireRole } from "@/lib/rbac";
import { loadMessages, pendingForThread } from "@/lib/ai/threads";
import type { TextBlock, ToolUseBlock } from "@/lib/ai/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCurrentUser(req);
    requireRole(actor?.role, "viewer");
    const { id } = await params;

    const [messages, pending] = await Promise.all([loadMessages(id), pendingForThread(id)]);

    // Flatten to what the panel renders: user/assistant text plus the tool calls
    // that ran, dropping raw tool_result payloads (they're model-facing).
    const view = messages.flatMap((m) => {
      const text = m.content
        .filter((b): b is TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      const tools = m.content
        .filter((b): b is ToolUseBlock => b.type === "tool_use")
        .map((b) => ({ id: b.id, name: b.name }));
      if (!text && tools.length === 0) return [];
      return [{ role: m.role, text, tools }];
    });

    return ok({
      messages: view,
      pending: pending.map((p) => ({
        toolUseId: p.tool_use_id,
        name: p.tool_name,
        summary: p.summary,
      })),
    });
  } catch (e) {
    return fail(e);
  }
}
