// Cross-client WhatsApp inbox (phase 4).
//
// The old screen showed one client at a time: to notice that a customer of
// T center was waiting you had to remember to switch to T center. This layer
// merges every bot channel into one stream so a waiting customer surfaces on
// its own, whichever client it belongs to.
//
// Two per-client rules travel with the chats and must not be dropped:
//   1. campaign bots (a project with `campaign_contacts`) expose ONLY the chats
//      that arrived from the ad — never the owner's personal chats;
//   2. `human_mode` marks the chats a human took over, so the row can say the
//      bot is muted there instead of looking mysteriously silent.
import { loadClients, clientTables, type ClientDef } from "./registry";
import { hasWhapi, listChats } from "./whapi";
import { listHumanModeActive } from "./human-mode";
import { campaignChatIds } from "./campaign";
import { introspect } from "./supabase-management";
import type { WhapiChat } from "./types";

/** One client's contribution to the merged inbox, before tagging/sorting. */
export interface InboxSource {
  clientId: string;
  clientName: string;
  accent?: string;
  /** WHAPI token key — the browser reuses the existing /api/whapi/[ref] routes. */
  whapiKey: string;
  chats: WhapiChat[];
  /** Allowed chat ids for a campaign bot, or null when the client has no allowlist. */
  allow: Set<string> | null;
  /** chat_id → human-takeover state, for the chats a human owns right now. */
  paused: Map<string, { until: string | null; expired: boolean }>;
  /** Whether this client supports per-chat bot muting at all. */
  hasHumanMode: boolean;
  /** Non-fatal per-client failure (dead token, unreachable project). */
  error: string | null;
}

export interface InboxChat {
  /** Unique across clients — two clients can hold the same phone number. */
  key: string;
  chatId: string;
  name: string;
  lastMessage: string | null;
  timestamp: number | null;
  unread: number;
  clientId: string;
  clientName: string;
  accent?: string;
  whapiKey: string;
  hasHumanMode: boolean;
  /** A human took the chat over and the bot is staying quiet. */
  paused: boolean;
  pausedUntil: string | null;
  /** Still flagged as taken over, but the silence window already elapsed. */
  pauseExpired: boolean;
}

export interface InboxClientMeta {
  id: string;
  name: string;
  accent?: string;
  whapiKey: string;
  chatCount: number;
  campaignOnly: boolean;
  hasHumanMode: boolean;
  error: string | null;
}

export interface InboxSnapshot {
  chats: InboxChat[];
  clients: InboxClientMeta[];
  generatedAt: string;
}

/**
 * Pure merge: apply each client's campaign allowlist, tag every chat with its
 * client and pause state, and order the whole stream newest-first. Kept free of
 * IO so the rules above are unit-testable without a WHAPI token.
 */
export function mergeInbox(sources: InboxSource[]): InboxChat[] {
  const out: InboxChat[] = [];
  for (const s of sources) {
    for (const c of s.chats) {
      if (s.allow && !s.allow.has(c.id)) continue;
      const pause = s.paused.get(c.id);
      out.push({
        key: `${s.clientId}:${c.id}`,
        chatId: c.id,
        name: c.name,
        lastMessage: c.lastMessage,
        timestamp: c.timestamp,
        unread: c.unread,
        clientId: s.clientId,
        clientName: s.clientName,
        accent: s.accent,
        whapiKey: s.whapiKey,
        hasHumanMode: s.hasHumanMode,
        paused: Boolean(pause && !pause.expired),
        pausedUntil: pause?.until ?? null,
        pauseExpired: Boolean(pause?.expired),
      });
    }
  }
  // Newest first. A missing timestamp counts as 0, so those chats settle at the
  // bottom rather than leading the stream.
  return out.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
}

export function toClientMeta(sources: InboxSource[], chats: InboxChat[]): InboxClientMeta[] {
  return sources.map((s) => ({
    id: s.clientId,
    name: s.clientName,
    accent: s.accent,
    whapiKey: s.whapiKey,
    chatCount: chats.filter((c) => c.clientId === s.clientId).length,
    campaignOnly: s.allow !== null,
    hasHumanMode: s.hasHumanMode,
    error: s.error,
  }));
}

/** Client table scoping decides which shared-project tables are really this
 *  client's: BRJewelry and Shift Digital live in the same Supabase project, so
 *  BRJewelry's campaign allowlist must not filter Shift Digital's chats. */
async function clientTableNames(c: ClientDef): Promise<string[]> {
  try {
    const schema = await introspect(c.supabaseRef);
    return clientTables(c, schema.tableNames);
  } catch {
    return [];
  }
}

async function loadSource(c: ClientDef, whapiKey: string): Promise<InboxSource> {
  const base: InboxSource = {
    clientId: c.id,
    clientName: c.name,
    accent: c.accent,
    whapiKey,
    chats: [],
    allow: null,
    paused: new Map(),
    hasHumanMode: false,
    error: null,
  };

  const tables = await clientTableNames(c);
  const hasHumanMode = tables.includes("human_mode");

  // One dead channel must not blank the whole inbox — each side degrades alone.
  const [chatsRes, allowRes, pausedRes] = await Promise.allSettled([
    listChats(whapiKey),
    tables.includes("campaign_contacts") ? campaignChatIds(c.supabaseRef) : Promise.resolve(null),
    hasHumanMode ? listHumanModeActive(c.supabaseRef) : Promise.resolve([]),
  ]);

  const paused = new Map<string, { until: string | null; expired: boolean }>();
  if (pausedRes.status === "fulfilled") {
    for (const item of pausedRes.value) {
      paused.set(item.chatId, { until: item.silencedUntil, expired: item.expired });
    }
  }

  return {
    ...base,
    hasHumanMode,
    chats: chatsRes.status === "fulfilled" ? chatsRes.value : [],
    allow: allowRes.status === "fulfilled" ? allowRes.value : null,
    paused,
    error:
      chatsRes.status === "rejected"
        ? chatsRes.reason instanceof Error
          ? chatsRes.reason.message
          : String(chatsRes.reason)
        : null,
  };
}

/** Every configured bot channel, merged. Clients without a WHAPI token are
 *  absent rather than shown as broken — there is nothing to monitor there. */
export async function loadInbox(): Promise<InboxSnapshot> {
  const clients = await loadClients();
  const withChannel = clients
    .map((c) => ({ c, whapiKey: c.whapiKey ?? c.supabaseRef }))
    .filter(({ whapiKey }) => hasWhapi(whapiKey));

  const sources = await Promise.all(withChannel.map(({ c, whapiKey }) => loadSource(c, whapiKey)));
  const chats = mergeInbox(sources);

  return {
    chats,
    clients: toClientMeta(sources, chats),
    generatedAt: new Date().toISOString(),
  };
}
