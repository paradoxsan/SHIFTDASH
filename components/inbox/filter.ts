// Pure filtering for the unified inbox. Lives beside the view (and not in
// lib/inbox.ts) so the browser bundle never pulls the server data layer in, and
// stays free of React so the rules can be unit-tested directly.
import type { InboxChat } from "@/lib/inbox";

export interface InboxFilter {
  /** Free text: contact name, or a phone fragment (digits only, 3+). */
  search: string;
  /** null = every client. */
  clientId: string | null;
  onlyUnread: boolean;
  /** Chats a human took over (including ones whose silence window elapsed). */
  onlyPaused: boolean;
}

export const EMPTY_FILTER: InboxFilter = {
  search: "",
  clientId: null,
  onlyUnread: false,
  onlyPaused: false,
};

export function digitsOf(value: string): string {
  return value.replace(/\D/g, "");
}

function matchesSearch(chat: InboxChat, search: string): boolean {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  if ((chat.name || "").toLowerCase().includes(term)) return true;
  // Phone search only once it is specific enough to mean something — a single
  // digit would match nearly every number.
  const digits = digitsOf(search);
  return digits.length >= 3 && digitsOf(chat.chatId).includes(digits);
}

export function filterInbox(chats: InboxChat[], f: InboxFilter): InboxChat[] {
  return chats.filter((c) => {
    if (f.clientId && c.clientId !== f.clientId) return false;
    if (f.onlyUnread && c.unread <= 0) return false;
    if (f.onlyPaused && !c.paused && !c.pauseExpired) return false;
    return matchesSearch(c, f.search);
  });
}

/** An Israeli number typed into the search box, as a WhatsApp chat id — lets
 *  you open a conversation that is not in the recent list yet. */
export function chatIdFromSearch(search: string): string | null {
  let digits = digitsOf(search);
  if (digits.length < 6) return null;
  if (digits.startsWith("0")) digits = `972${digits.slice(1)}`;
  return `${digits}@s.whatsapp.net`;
}
