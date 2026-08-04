// ── Operator quick-wins service (BotOps Phase 5) ──────────────────────────────
// The high-ROI "stop the bleeding" actions, ALL built on the Phase 4 audited,
// PK-scoped query builder so every mutation is RBAC-checked, value-bound, and
// written to the audit log:
//   • requeue a failed inbox row  (PK-scoped, attempts-capped)
//   • list the failed/stuck queue
//   • list + chase open orders with a payment link (honours human takeover)
// The eligibility/format helpers are pure (no I/O) so the safety rules are
// unit-tested without touching a live bot.
//
// Safety posture (post-review): RBAC is enforced BEFORE any data-plane read; the
// human-takeover check on the SEND path FAILS CLOSED (a read error refuses the
// send rather than messaging over a human); chase targets only the NEWEST open
// order per chat and is rate-limited via the audit log.
import { selectRows, updateRowByPk, QueryBuilderError } from "./query-builder";
import { auditedMutation } from "./audited";
import { wasActionedRecently } from "../control-plane";
import { sendText } from "../whapi";
import { requireRole } from "../rbac";
import type { Session } from "../auth";
import type { QueueItem, ChaseOrder } from "../types";

export class OperatorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperatorError";
  }
}

export const REQUEUABLE_STATUSES = ["failed", "error"] as const;
export const DEFAULT_MAX_ATTEMPTS = 8;
export const CHASE_COOLDOWN_MINUTES = 360; // don't re-chase the same order within 6h

// ── Requeue ───────────────────────────────────────────────────────────────────
interface InboxRowLike {
  status?: unknown;
  attempts?: unknown;
}

/**
 * Pure: is this inbox row safe to requeue? Only genuinely failed rows, capped by
 * attempts. We deliberately do NOT infer "stuck" from created_at — inbox has no
 * processing-start timestamp, so an age heuristic could requeue an actively
 * in-flight row and double-message the customer. Operators see 'processing' rows
 * in the queue but they are not auto-requeuable.
 */
export function requeueEligibility(
  row: InboxRowLike,
  opts: { maxAttempts?: number } = {}
): { eligible: boolean; reason?: string } {
  const max = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const status = String(row.status ?? "").toLowerCase();
  const attempts = Number(row.attempts ?? 0);

  if (!(REQUEUABLE_STATUSES as readonly string[]).includes(status)) {
    return { eligible: false, reason: `status '${status || "?"}' is not requeuable` };
  }
  if (Number.isFinite(attempts) && attempts >= max) {
    return { eligible: false, reason: `attempts ${attempts} ≥ cap ${max}` };
  }
  return { eligible: true };
}

/** List the failed / stuck inbox rows for an operator to act on. */
export async function listQueue(
  ref: string,
  opts: { limit?: number; table?: string; maxAttempts?: number } = {}
): Promise<QueueItem[]> {
  const table = opts.table ?? "inbox";
  const res = await selectRows(ref, table, {
    where: [{ column: "status", op: "in", value: ["failed", "error", "processing"] }],
    orderBy: "created_at",
    orderDir: "desc",
    limit: Math.min(opts.limit ?? 50, 200),
  });
  return res.rows.map((r) => {
    const elig = requeueEligibility(r as InboxRowLike, { maxAttempts: opts.maxAttempts });
    return {
      id: r.id as number,
      chatId: (r.chat_id as string) ?? null,
      status: String(r.status ?? ""),
      attempts: Number(r.attempts ?? 0),
      error: (r.error as string) ?? null,
      createdAt: (r.created_at as string) ?? null,
      requeuable: elig.eligible,
      reason: elig.reason,
    };
  });
}

/** Requeue ONE inbox row by its primary key: status→'new', error→null. Audited.
 *  RBAC is enforced BEFORE the read so an under-privileged caller cannot probe. */
export async function requeueInboxRow(args: {
  ref: string;
  id: number | string;
  actor: Session | null;
  table?: string;
  maxAttempts?: number;
}): Promise<{ requeued: true; updated: string[] }> {
  requireRole(args.actor?.role, "operator");
  const table = args.table ?? "inbox";

  const res = await selectRows(args.ref, table, {
    where: [{ column: "id", op: "eq", value: args.id }],
    limit: 1,
  });
  const row = res.rows[0];
  if (!row) throw new OperatorError(`inbox row ${args.id} not found`);

  const elig = requeueEligibility(row as InboxRowLike, { maxAttempts: args.maxAttempts });
  if (!elig.eligible) throw new OperatorError(elig.reason ?? "row is not requeuable");

  const out = await updateRowByPk({
    ref: args.ref,
    table,
    pk: { id: args.id },
    set: { status: "new", error: null },
    actor: args.actor,
    minRole: "operator",
    action: "inbox.requeue",
  });
  return { requeued: true, updated: out.updated };
}

// ── Payment-chase ─────────────────────────────────────────────────────────────
/** Pure: may this order be chased now? Open + has link + no human takeover. */
export function chaseEligibility(o: {
  status: string;
  hasLink: boolean;
  humanActive: boolean;
}): { eligible: boolean; reason?: string } {
  if (String(o.status).toLowerCase() !== "open") return { eligible: false, reason: "order is not open" };
  if (!o.hasLink) return { eligible: false, reason: "no payment link" };
  if (o.humanActive) return { eligible: false, reason: "chat under human takeover" };
  return { eligible: true };
}

/** Pure: the default Hebrew payment-reminder text. */
export function chaseMessage(o: { invoiceName: string | null; total: number | null; paymentLink: string }): string {
  const name = o.invoiceName ? ` ${o.invoiceName}` : "";
  const amount = o.total != null ? ` על סך ${o.total}₪` : "";
  return `שלום${name}, רצינו להזכיר שההזמנה שלך${amount} ממתינה לתשלום 🙂\nניתן להשלים את התשלום כאן: ${o.paymentLink}`;
}

/** Pure: chat_id is already the WHAPI chat id (e.g. 972...@s.whatsapp.net). */
export function chatIdToWhapiTo(chatId: string): string {
  return chatId.trim();
}

/** Active human-takeover chat ids (LIST path — fail-open is acceptable, UI only). */
async function activeHumanChatIds(ref: string): Promise<Set<string>> {
  try {
    const res = await selectRows(ref, "human_mode", {
      where: [{ column: "active", op: "eq", value: true }],
      limit: 1000,
    });
    return new Set(res.rows.map((r) => String(r.chat_id)));
  } catch {
    return new Set();
  }
}

/**
 * SEND path: is THIS chat under active human takeover? FAILS CLOSED — only a
 * genuine "human_mode table/column absent" (QueryBuilderError) means "no takeover
 * capability → false"; any other (transient) error propagates so the caller
 * refuses the send rather than messaging over a human.
 */
async function isChatUnderHumanStrict(ref: string, chatId: string): Promise<boolean> {
  try {
    const res = await selectRows(ref, "human_mode", {
      where: [
        { column: "chat_id", op: "eq", value: chatId },
        { column: "active", op: "eq", value: true },
      ],
      limit: 1,
    });
    return res.rows.length > 0;
  } catch (e) {
    if (e instanceof QueryBuilderError) return false; // table/column genuinely absent
    throw e; // transient read failure → fail closed (caller will not send)
  }
}

/** Open orders with a payment link, annotated with chase eligibility. */
export async function listChaseableOrders(ref: string, opts: { limit?: number } = {}): Promise<ChaseOrder[]> {
  const res = await selectRows(ref, "orders", {
    where: [{ column: "status", op: "eq", value: "open" }],
    orderBy: "created_at",
    orderDir: "desc",
    limit: Math.min(opts.limit ?? 100, 300),
  });
  const active = await activeHumanChatIds(ref);
  return res.rows.map((o) => {
    const chatId = (o.chat_id as string) ?? null;
    const hasLink = Boolean(o.payment_link && String(o.payment_link).trim());
    const humanActive = chatId ? active.has(chatId) : false;
    const elig = chaseEligibility({ status: String(o.status), hasLink, humanActive });
    return {
      id: o.id as number,
      chatId,
      invoiceName: (o.invoice_name as string) ?? null,
      total: o.total != null ? Number(o.total) : null,
      status: String(o.status ?? ""),
      hasLink,
      humanActive,
      chaseable: elig.eligible,
      reason: elig.reason,
    };
  });
}

/** Resend the payment link for ONE order via WHAPI. RBAC first; then validate:
 *  open + has link + newest open order for its chat + no human takeover (fail
 *  closed) + not chased within the cooldown. Audited (action: order.chase). */
export async function chaseOrder(args: {
  ref: string;
  orderId: number | string;
  actor: Session | null;
  message?: string;
}): Promise<{ sent: boolean; to: string }> {
  requireRole(args.actor?.role, "operator");

  const res = await selectRows(args.ref, "orders", {
    where: [{ column: "id", op: "eq", value: args.orderId }],
    limit: 1,
  });
  const order = res.rows[0];
  if (!order) throw new OperatorError(`order ${args.orderId} not found`);

  const chatId = String(order.chat_id ?? "").trim();
  if (!chatId) throw new OperatorError("order has no chat_id to message");
  const paymentLink = String(order.payment_link ?? "").trim();
  const hasLink = Boolean(paymentLink);

  // Don't dun a stale order: refuse if a NEWER open order exists for this chat
  // (orders.chat_id is non-unique; the bot supersedes by inserting a new open
  // row). Compare by the monotonic bigserial `id` (a higher id = created later) so
  // an exact created_at tie can't slip a stale order through.
  const newer = await selectRows(args.ref, "orders", {
    where: [
      { column: "chat_id", op: "eq", value: chatId },
      { column: "status", op: "eq", value: "open" },
      { column: "id", op: "gt", value: args.orderId },
    ],
    limit: 1,
  });
  if (newer.rows.length > 0) {
    throw new OperatorError("קיימת הזמנה פתוחה חדשה יותר לשיחה הזו — לא נשלחה תזכורת");
  }

  // Human takeover — re-checked fresh at send time, FAIL CLOSED on read error.
  const humanActive = await isChatUnderHumanStrict(args.ref, chatId);
  const elig = chaseEligibility({ status: String(order.status), hasLink, humanActive });
  if (!elig.eligible) throw new OperatorError(elig.reason ?? "order is not chaseable");

  // Cooldown: don't spam the customer — refuse if chased successfully recently.
  if (await wasActionedRecently("order.chase", `${args.ref}.orders`, String(args.orderId), CHASE_COOLDOWN_MINUTES)) {
    throw new OperatorError("כבר נשלחה תזכורת להזמנה זו לאחרונה");
  }

  const to = chatIdToWhapiTo(chatId);
  const text =
    args.message?.trim() ||
    chaseMessage({
      invoiceName: (order.invoice_name as string) ?? null,
      total: order.total != null ? Number(order.total) : null,
      paymentLink,
    });

  return auditedMutation(
    {
      actor: args.actor,
      minRole: "operator",
      action: "order.chase",
      targetType: `${args.ref}.orders`,
      targetId: String(args.orderId),
      payload: { to, total: order.total ?? null },
    },
    async () => {
      const r = await sendText(args.ref, to, text);
      return { sent: r.sent, to };
    }
  );
}
