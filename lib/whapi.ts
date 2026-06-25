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

interface RawChat {
  id: string;
  name?: string;
  timestamp?: number;
  unread?: number;
  last_message?: {
    text?: { body?: string };
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
        lastMessage: messagePreview(lm?.type, lm?.text?.body, lm?.caption) || null,
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
      return {
        id: m.id,
        fromMe: Boolean(m.from_me),
        type: m.type ?? "text",
        text: m.text?.body ?? null,
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
