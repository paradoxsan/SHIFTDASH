// Copilot chat — one SSE endpoint for both "send a message" and "approve/reject
// a proposed action", because approving IS continuing the same conversation.
// The browser sends only a thread id plus its intent; the transcript, the tool
// results and the approval state all live server-side.
import { z } from "zod";
import { fail, parseBody } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/current-user";
import { env } from "@/lib/env";
import { requireRole } from "@/lib/rbac";
import { runAgent, type AgentEvent } from "@/lib/ai/agent";
import { systemPrompt } from "@/lib/ai/context";
import {
  appendMessage,
  createThread,
  decidePending,
  getPending,
  loadMessages,
  markPendingOutcome,
  recordPending,
} from "@/lib/ai/threads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.union([
  z.object({
    kind: z.literal("message"),
    threadId: z.string().uuid().optional(),
    text: z.string().min(1).max(8000),
  }),
  z.object({
    kind: z.literal("decision"),
    threadId: z.string().uuid(),
    toolUseId: z.string().min(1),
    approve: z.boolean(),
  }),
]);

function sse(event: AgentEvent | { type: "thread"; threadId: string }): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: Request) {
  try {
    const parsed = await parseBody(req, bodySchema);
    if (!parsed.ok) return parsed.res;
    if (!env.aiConfigured()) return fail(new Error("AI לא מוגדר (חסר ANTHROPIC_API_KEY)"), 503);

    const actor = await getCurrentUser(req);
    // Reading requires a session; individual write tools re-check for operator.
    requireRole(actor?.role, "viewer");

    const body = parsed.data;
    let threadId: string;
    const approved = new Set<string>();
    const rejected = new Set<string>();

    if (body.kind === "message") {
      threadId = body.threadId ?? (await createThread(actor?.email ?? null, body.text));
      await appendMessage(threadId, {
        role: "user",
        content: [{ type: "text", text: body.text }],
      });
    } else {
      threadId = body.threadId;
      const pending = await getPending(body.toolUseId);
      if (!pending || pending.thread_id !== threadId) {
        return fail(new Error("הפעולה כבר לא ממתינה לאישור"), 409);
      }
      if (pending.status !== "pending") {
        return fail(new Error(`הפעולה כבר ${pending.status}`), 409);
      }
      await decidePending(body.toolUseId, body.approve ? "approved" : "rejected");
      (body.approve ? approved : rejected).add(body.toolUseId);
    }

    const messages = await loadMessages(threadId);
    const system = await systemPrompt();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const enc = new TextEncoder();
        const push = (e: AgentEvent | { type: "thread"; threadId: string }) =>
          controller.enqueue(enc.encode(sse(e)));

        push({ type: "thread", threadId });
        try {
          for await (const event of runAgent({
            messages,
            system,
            actor,
            approvedToolUseIds: approved,
            rejectedToolUseIds: rejected,
          })) {
            if (event.type === "message") {
              await appendMessage(threadId, event.message);
              continue; // persistence detail — the client rebuilds from the stream
            }
            if (event.type === "approval_required") {
              await recordPending({
                threadId,
                toolUseId: event.id,
                toolName: event.name,
                input: event.input,
                summary: event.summary,
              });
            }
            if (event.type === "tool_result" && approved.has(event.id)) {
              await markPendingOutcome(event.id, event.ok ? "executed" : "failed");
            }
            push(event);
          }
        } catch (e) {
          push({ type: "error", message: e instanceof Error ? e.message : String(e) });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  } catch (e) {
    return fail(e);
  }
}
