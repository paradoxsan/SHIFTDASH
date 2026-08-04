// Per-conversation bot control. The n8n bots read the `human_mode` table
// (verified: active + silenced_until are checked before the bot replies), so
// flipping this from the dashboard genuinely pauses/resumes the bot for a chat.
//   active = true  → a human took over → bot stays silent
//   silenced_until → bot silent until that time, then auto-resumes
import { runSql } from "./supabase-management";
import { sqlString } from "./sql";
import type { WatchlistItem } from "./types";

export interface HumanModeState {
  chatId: string;
  active: boolean;
  silencedUntil: string | null;
  updatedAt: string | null;
}

/** Watchlist (Phase 5): all chats a human has taken over, newest first, with a
 *  flag for those whose silence window has elapsed (the bot may have resumed). */
export async function listHumanModeActive(ref: string): Promise<WatchlistItem[]> {
  const rows = await runSql<{
    chat_id: string;
    active: boolean;
    silenced_until: string | null;
    updated_at: string | null;
  }>(
    ref,
    `select chat_id, active, silenced_until, updated_at
       from public.human_mode
      where active = true
      order by updated_at desc nulls last
      limit 500`
  );
  const now = Date.now();
  return rows.map((r) => ({
    chatId: r.chat_id,
    active: r.active,
    silencedUntil: r.silenced_until,
    updatedAt: r.updated_at,
    expired: r.silenced_until ? new Date(r.silenced_until).getTime() < now : false,
  }));
}

export async function getHumanMode(ref: string, chatId: string): Promise<HumanModeState> {
  const rows = await runSql<{
    active: boolean;
    silenced_until: string | null;
    updated_at: string | null;
  }>(
    ref,
    `select active, silenced_until, updated_at
       from public.human_mode
      where chat_id = ${sqlString(chatId)}
      limit 1`
  );
  const r = rows[0];
  return {
    chatId,
    active: r?.active ?? false,
    silencedUntil: r?.silenced_until ?? null,
    updatedAt: r?.updated_at ?? null,
  };
}

export async function setHumanMode(
  ref: string,
  chatId: string,
  active: boolean,
  silenceMinutes?: number
): Promise<HumanModeState> {
  const silenced =
    active && silenceMinutes && silenceMinutes > 0
      ? `now() + interval '${Math.floor(silenceMinutes)} minutes'`
      : "null";
  await runSql(
    ref,
    `insert into public.human_mode (chat_id, active, silenced_until, updated_at)
     values (${sqlString(chatId)}, ${active ? "true" : "false"}, ${silenced}, now())
     on conflict (chat_id) do update
       set active = excluded.active,
           silenced_until = excluded.silenced_until,
           updated_at = now()`
  );
  return getHumanMode(ref, chatId);
}
