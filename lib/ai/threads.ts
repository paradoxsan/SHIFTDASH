// Thread persistence for the copilot. Conversation state is server-side so the
// browser can never hand us a forged tool_result — it only ever sends a thread
// id plus a new message or an approve/reject decision.
import { runSql } from "../supabase-management";
import { controlPlaneRef } from "../control-plane";
import { sqlString } from "../sql";
import type { AgentMessage, ContentBlock } from "./agent";

const cp = () => controlPlaneRef();

export interface ThreadRow {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  /** Bot slug of the client agent this thread belongs to; null = agency copilot. */
  client: string | null;
}

export interface PendingAction {
  id: string;
  thread_id: string;
  tool_use_id: string;
  tool_name: string;
  input: unknown;
  summary: string | null;
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
}

/**
 * A thread's client is resolved from the bot slug ONCE, at creation, and stored
 * as the tenant id. Re-resolving per turn would let a thread silently change
 * agent if the registry moved a slug — and the transcript would then mix two
 * clients' data under one scope check.
 */
export async function createThread(
  userEmail: string | null,
  title: string,
  clientSlug?: string | null
): Promise<string> {
  const tenant = clientSlug
    ? `(select tenant_id from botops.bots where slug = ${sqlString(clientSlug)} limit 1)`
    : "null";
  const rows = await runSql<{ id: string }>(
    cp(),
    `insert into botops.ai_threads (user_id, title, tenant_id)
       values (
         (select id from botops.app_users where lower(email) = lower(${sqlString(userEmail ?? "")}) limit 1),
         ${sqlString(title.slice(0, 120))},
         ${tenant}
       )
     returning id`
  );
  return rows[0].id;
}

/**
 * Threads for one agent. `client` undefined lists everything; null lists only
 * the agency copilot's threads — the distinction matters because the agent
 * picker must not file T center's debug sessions under the agency assistant.
 */
export async function listThreads(
  userEmail: string | null,
  opts: { client?: string | null; limit?: number } = {}
): Promise<ThreadRow[]> {
  const limit = Math.floor(opts.limit ?? 30);
  const scope =
    opts.client === undefined
      ? ""
      : opts.client === null
        ? "and t.tenant_id is null"
        : `and b.slug = ${sqlString(opts.client)}`;

  return runSql<ThreadRow>(
    cp(),
    `select t.id, t.title, t.created_at, t.updated_at, b.slug as client
       from botops.ai_threads t
       left join botops.app_users u on u.id = t.user_id
       left join botops.bots b on b.tenant_id = t.tenant_id
      where (u.email is null or lower(u.email) = lower(${sqlString(userEmail ?? "")}))
        ${scope}
      order by t.updated_at desc
      limit ${limit}`
  );
}

/**
 * The client a thread is pinned to — the authority for tool scoping. Read from
 * the DB rather than trusted from the request body, so the browser cannot widen
 * its own scope by posting a different slug alongside an existing thread id.
 */
export async function threadClient(threadId: string): Promise<string | null> {
  const rows = await runSql<{ client: string | null }>(
    cp(),
    `select b.slug as client
       from botops.ai_threads t
       left join botops.bots b on b.tenant_id = t.tenant_id
      where t.id = ${sqlString(threadId)}::uuid
      limit 1`
  );
  return rows[0]?.client ?? null;
}

export async function loadMessages(threadId: string): Promise<AgentMessage[]> {
  const rows = await runSql<{ role: "user" | "assistant"; content: ContentBlock[] }>(
    cp(),
    `select role, content from botops.ai_messages
      where thread_id = ${sqlString(threadId)}::uuid
      order by id asc`
  );
  return rows.map((r) => ({
    role: r.role,
    // Postgres returns jsonb already parsed, but a driver that hands back text
    // shouldn't corrupt a whole thread.
    content: (typeof r.content === "string" ? JSON.parse(r.content) : r.content) as ContentBlock[],
  }));
}

export async function appendMessage(threadId: string, message: AgentMessage): Promise<void> {
  await runSql(
    cp(),
    `insert into botops.ai_messages (thread_id, role, content)
       values (${sqlString(threadId)}::uuid, ${sqlString(message.role)},
               ${sqlString(JSON.stringify(message.content))}::jsonb)`
  );
  await runSql(
    cp(),
    `update botops.ai_threads set updated_at = now() where id = ${sqlString(threadId)}::uuid`
  );
}

export async function recordPending(args: {
  threadId: string;
  toolUseId: string;
  toolName: string;
  input: unknown;
  summary: string;
}): Promise<void> {
  await runSql(
    cp(),
    `insert into botops.ai_pending_actions (thread_id, tool_use_id, tool_name, input, summary)
       values (${sqlString(args.threadId)}::uuid, ${sqlString(args.toolUseId)},
               ${sqlString(args.toolName)}, ${sqlString(JSON.stringify(args.input ?? {}))}::jsonb,
               ${sqlString(args.summary)})
     on conflict (tool_use_id) do nothing`
  );
}

export async function getPending(toolUseId: string): Promise<PendingAction | null> {
  const rows = await runSql<PendingAction>(
    cp(),
    `select id, thread_id, tool_use_id, tool_name, input, summary, status
       from botops.ai_pending_actions
      where tool_use_id = ${sqlString(toolUseId)}
      limit 1`
  );
  return rows[0] ?? null;
}

export async function decidePending(
  toolUseId: string,
  status: "approved" | "rejected"
): Promise<void> {
  await runSql(
    cp(),
    `update botops.ai_pending_actions
        set status = ${sqlString(status)}, decided_at = now()
      where tool_use_id = ${sqlString(toolUseId)} and status = 'pending'`
  );
}

export async function markPendingOutcome(
  toolUseId: string,
  status: "executed" | "failed"
): Promise<void> {
  await runSql(
    cp(),
    `update botops.ai_pending_actions
        set status = ${sqlString(status)}
      where tool_use_id = ${sqlString(toolUseId)}`
  );
}

/** Open proposals for a thread — used to re-render approval cards after reload. */
export async function pendingForThread(threadId: string): Promise<PendingAction[]> {
  return runSql<PendingAction>(
    cp(),
    `select id, thread_id, tool_use_id, tool_name, input, summary, status
       from botops.ai_pending_actions
      where thread_id = ${sqlString(threadId)}::uuid and status = 'pending'
      order by created_at asc`
  );
}
