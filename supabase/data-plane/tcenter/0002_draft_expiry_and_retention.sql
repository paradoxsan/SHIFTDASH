-- T-CENTER data plane — draft expiry correctness + the retention that was missing.
--
-- CONTEXT (investigated 2026-08-30, after "the bot hasn't closed an order since
-- the morning"). The order-closing funnel collapsed on 27/08: last `orders` row
-- #493 at 14:39Z, last draft CLOSED 14:28Z, last draft CREATED 28/08 07:52Z, and
-- nothing since. The bot still answers — it just never persists order state any
-- more, so on a short customer turn ("כן" / "לאשר" / a bare invoice name) it has
-- nothing to hold on to and restarts the conversation.
--
-- THE TRIGGER IS UPSTREAM, IN N8N: `tc_draft_apply` is healthy and simply is not
-- being called (chats that ran a full order today have NO order_drafts row at
-- all). Nothing in this file makes the bot close orders again — that fix belongs
-- in the workflow. What this file does is repair the two DB-side defects the
-- investigation surfaced, so the draft layer is correct once n8n calls it again,
-- and add the retention nobody ever wrote.

-- ── 1. Expiry must key off IDLE TIME, not age ───────────────────────────────
-- tc_draft_expire_stale compared `created_at` to the TTL, so a draft died 7 days
-- after it was OPENED even if the customer wrote a minute ago. Real: 2 drafts
-- were still being written to 8+ days after creation (they should have been
-- expired and re-opened, instead their old lines merge into the new order).
-- `updated_at` is maintained by tc_draft_apply on every patch, so it is the
-- honest "is this conversation still alive" signal.
create or replace function public.tc_draft_expire_stale(p_chat_id text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare n integer;
begin
  if p_chat_id is null or p_chat_id = '' then return 0; end if;
  update order_drafts
     set status = 'expired', updated_at = now()
   where chat_id = p_chat_id
     and status = 'collecting'
     and updated_at < now() - tc_draft_ttl();
  get diagnostics n = row_count;
  return n;
end;
$function$;

-- ── 2. A GLOBAL sweeper ─────────────────────────────────────────────────────
-- Expiry only ever ran from tc_draft_get(p_chat_id) — i.e. only for the one chat
-- the bot happened to be handling. A customer who never comes back keeps their
-- draft in 'collecting' forever: 323 such drafts had piled up, the oldest from
-- 06/08. That matters because `order_drafts_open_uniq` is UNIQUE(chat_id) WHERE
-- status='collecting', so the stale row is the one tc_draft_apply reuses when
-- that customer returns weeks later — silently merging a dead order into a new
-- one. Nightly sweep, same 7-day idle TTL, applied to every chat.
create or replace function public.tc_draft_sweep()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare n integer;
begin
  update order_drafts
     set status = 'expired', updated_at = now()
   where status = 'collecting'
     and updated_at < now() - tc_draft_ttl();
  get diagnostics n = row_count;
  return n;
end;
$function$;

revoke all on function public.tc_draft_sweep() from anon, authenticated;

-- ── 3. Retention ────────────────────────────────────────────────────────────
-- Only one cron existed on this project (delete-old-graphics, 2 days — those are
-- base64 blobs). Everything else grew unbounded.
--
-- inbox — 182,321 rows / 239 MB, EVERY row still status='new': nothing has ever
-- drained this queue, and the conversation the bot actually reads lives in
-- chat_messages. Its only live job is de-duplication through the unique
-- inbox_message_id_uidx, which needs days, not months. 30 days is a wide margin
-- over that and over the 7-day draft TTL. 117,325 rows are already past it.
-- Deleted in bounded batches so one nightly run never takes a long lock; at
-- ~1,500 rows/day inflow the 20k/night cap drains the backlog in about a week
-- and then just holds the line.
create or replace function public.tc_prune_inbox(p_keep_days int default 30, p_max_rows int default 20000)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare n integer;
begin
  with doomed as (
    select id from inbox
     where created_at < now() - make_interval(days => p_keep_days)
     order by id
     limit p_max_rows
  )
  delete from inbox i using doomed d where i.id = d.id;
  get diagnostics n = row_count;
  return n;
end;
$function$;

revoke all on function public.tc_prune_inbox(int, int) from anon, authenticated;

-- chat_messages — the bot's memory, 117,982 rows / 49 MB back to 2024. This is a
-- CEILING, not a cleanup: it deletes nothing today. Window measured from how far
-- apart a returning customer's turns actually are — 112,509 gaps under a day,
-- 2,514 at 1-7d, 547 at 7-30d, 88 at 30-90d and ZERO beyond 90 days. 180 days is
-- double the longest gap ever observed, so no returning customer loses history.
create or replace function public.tc_prune_chat_messages(p_keep_days int default 180, p_max_rows int default 20000)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare n integer;
begin
  with doomed as (
    select id from chat_messages
     where created_at < now() - make_interval(days => p_keep_days)
     order by id
     limit p_max_rows
  )
  delete from chat_messages c using doomed d where c.id = d.id;
  get diagnostics n = row_count;
  return n;
end;
$function$;

revoke all on function public.tc_prune_chat_messages(int, int) from anon, authenticated;

-- audit_log is deliberately NOT pruned here: something already trims it to ~4
-- days (3,436 rows, ids contiguous from 121630), so a looser cron would be a
-- no-op. Left alone rather than adding a rule that does nothing.

-- ── 4. Schedules ────────────────────────────────────────────────────────────
-- Staggered off the 03:00 graphics job so the nightly work does not overlap.
select cron.unschedule('tc-draft-sweep')         where exists (select 1 from cron.job where jobname = 'tc-draft-sweep');
select cron.unschedule('tc-prune-inbox')         where exists (select 1 from cron.job where jobname = 'tc-prune-inbox');
select cron.unschedule('tc-prune-chat-messages') where exists (select 1 from cron.job where jobname = 'tc-prune-chat-messages');

select cron.schedule('tc-draft-sweep',         '10 3 * * *', $$select public.tc_draft_sweep()$$);
select cron.schedule('tc-prune-inbox',         '20 3 * * *', $$select public.tc_prune_inbox()$$);
select cron.schedule('tc-prune-chat-messages', '40 3 * * *', $$select public.tc_prune_chat_messages()$$);

-- Rollback:
--   select cron.unschedule('tc-draft-sweep');
--   select cron.unschedule('tc-prune-inbox');
--   select cron.unschedule('tc-prune-chat-messages');
--   drop function public.tc_draft_sweep();
--   drop function public.tc_prune_inbox(int, int);
--   drop function public.tc_prune_chat_messages(int, int);
--   -- and restore the created_at form of tc_draft_expire_stale from 0001-era state.
