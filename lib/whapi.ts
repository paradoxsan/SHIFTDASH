// WHAPI (whapi.cloud) client — one token per customer/channel, keyed by the
// Supabase project ref. Used to read WhatsApp conversations and send replies.
import { env } from "./env";
import { messagePreview } from "./format";
import type { WhapiChat, WhapiMessage } from "./types";

function tokenFor(ref: string): string {
  const t = env.whapiTokens()[ref];
  if (!t) throw new Error(`No WHAPI token configured for project "${ref}"`);
  return t;
}
function headers(ref: string): HeadersInit {
  return {
    Authorization: `Bearer ${tokenFor(ref)}`,
    accept: "application/json",
    "content-type": "application/json",
  };
}

export function hasWhapi(ref: string): boolean {
  return Boolean(env.whapiTokens()[ref]);
}

export interface ChannelProbe {
  ok: boolean;
  detail?: string;
}

/** Statuses WHAPI reports while a channel is running but has no usable session. */
const DISCONNECTED_STATUSES = new Set([
  "QR", // waiting for someone to scan — i.e. the phone was unlinked
  "LAUNCH",
  "STARTING",
  "INIT",
  "CONFLICT", // another device took the session
  "LOGGED_OUT",
  "BANNED",
  "EXPIRED",
  "STOPPED",
]);

/**
 * Pure: decide whether a WHAPI `/health` body describes a channel that can
 * actually send and receive.
 *
 * A logged-out channel answers HTTP 200 to everything — `/chats` included, just
 * with an empty list — so status codes alone cannot see an outage. `/health` is
 * the only endpoint that distinguishes them: a paired channel reports
 * `status.text: "AUTH"` with a populated `user`; an unpaired one reports `"QR"`
 * with `user: null`. Both signals are required, because either can go stale
 * alone.
 *
 * Deliberately fails OPEN on a shape we do not recognise: a WHAPI schema change
 * must not fire a critical alert every cycle for a bot that is working.
 */
export function channelStatusFromHealth(raw: unknown): ChannelProbe {
  if (!raw || typeof raw !== "object") return { ok: true };

  const body = raw as { status?: { text?: unknown; code?: unknown }; user?: unknown };
  const statusText = typeof body.status?.text === "string" ? body.status.text.toUpperCase() : null;
  const hasUser = Boolean(body.user && typeof body.user === "object");

  // Neither signal present — an unknown payload, not evidence of a fault.
  if (statusText === null && body.user === undefined) return { ok: true };

  if (statusText !== null && DISCONNECTED_STATUSES.has(statusText)) {
    return { ok: false, detail: `הטלפון לא מקושר לערוץ (${statusText}) — צריך לסרוק QR מחדש` };
  }
  if (!hasUser) {
    return {
      ok: false,
      detail: `הטלפון לא מקושר לערוץ (${statusText ?? "אין סשן"}) — צריך לסרוק QR מחדש`,
    };
  }
  return { ok: true };
}

/**
 * Honest liveness probe for a channel. A 401/403 means the token is dead, any
 * other non-2xx means WHAPI is unreachable, and a 2xx still has to be inspected
 * — see `channelStatusFromHealth` for why 200 does not mean "connected".
 */
export async function probeChannel(ref: string): Promise<ChannelProbe> {
  try {
    const res = await fetch(`${env.whapiBaseUrl()}/health`, {
      headers: headers(ref),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, detail: `טוקן לא תקף (${res.status})` };
    }
    if (!res.ok) return { ok: false, detail: `WHAPI ${res.status}` };
    return channelStatusFromHealth(await res.json().catch(() => null));
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "לא ניתן להגיע ל-WHAPI" };
  }
}

interface RawChat {
  id: string;
  name?: string;
  timestamp?: number;
  unread?: number;
  last_message?: {
    text?: { body?: string };
    link_preview?: { body?: string; url?: string };
    caption?: string;
    type?: string;
    timestamp?: number;
    from_me?: boolean;
    from_name?: string;
  };
}

export async function listChats(ref: string): Promise<WhapiChat[]> {
  const u = new URL(`${env.whapiBaseUrl()}/chats`);
  u.searchParams.set("count", "100");
  const res = await fetch(u, { headers: headers(ref), cache: "no-store" });
  if (!res.ok) throw new Error(`WHAPI /chats ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { chats?: RawChat[] };
  return (data.chats ?? [])
    .map((c) => {
      const lm = c.last_message;
      // Use the sender name only when the last message is incoming — outgoing
      // (from_me) messages may carry the business name, not the customer's.
      const contactName = lm && lm.from_me === false ? lm.from_name : undefined;
      return {
        id: c.id,
        name: c.name || contactName || c.id?.split("@")[0] || "—",
        lastMessage:
          messagePreview(
            lm?.type,
            lm?.text?.body ?? lm?.link_preview?.body ?? lm?.link_preview?.url,
            lm?.caption
          ) || null,
        timestamp: lm?.timestamp ?? c.timestamp ?? null,
        unread: c.unread ?? 0,
      };
    })
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
}

interface RawMessage {
  id: string;
  from_me?: boolean;
  type?: string;
  timestamp?: number;
  text?: { body?: string };
  link_preview?: { body?: string; url?: string; preview?: string };
  caption?: string;
  [key: string]: unknown;
}

export async function listMessages(ref: string, chatId: string): Promise<WhapiMessage[]> {
  const u = new URL(`${env.whapiBaseUrl()}/messages/list/${encodeURIComponent(chatId)}`);
  u.searchParams.set("count", "100");
  const res = await fetch(u, { headers: headers(ref), cache: "no-store" });
  if (!res.ok) throw new Error(`WHAPI /messages ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { messages?: RawMessage[] };
  return (data.messages ?? [])
    .map((m) => {
      const sub =
        (m.type && (m[m.type] as { caption?: string; link?: string } | undefined)) || undefined;
      const mediaUrl =
        m.type === "image" || m.type === "video" || m.type === "sticker" || m.type === "gif"
          ? sub?.link ?? null
          : null;
      // WHAPI auto-converts text containing a URL into type "link_preview" with
      // the actual text in link_preview.body — fall back to that so payment-link
      // sends and other URL-bearing messages render as their text in the UI.
      const linkText = m.link_preview?.body ?? m.link_preview?.url ?? null;
      return {
        id: m.id,
        fromMe: Boolean(m.from_me),
        type: m.type ?? "text",
        text: m.text?.body ?? linkText,
        caption: sub?.caption ?? m.caption ?? null,
        timestamp: m.timestamp ?? null,
        mediaUrl,
      };
    })
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
}

export async function sendText(
  ref: string,
  to: string,
  body: string
): Promise<{ id: string | null; sent: boolean }> {
  const res = await fetch(`${env.whapiBaseUrl()}/messages/text`, {
    method: "POST",
    headers: headers(ref),
    body: JSON.stringify({ to, body }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`WHAPI send ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { sent?: boolean; message?: { id?: string }; id?: string };
  return { id: data.message?.id ?? data.id ?? null, sent: data.sent ?? true };
}
