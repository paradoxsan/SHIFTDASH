-- T-Center: remember every time the bot handed a customer to Asi, so a reminder
-- can go to the orders group when nobody answered.
--
-- Written by the n8n "Friction Gate" / "Repeat Guard" handoff branch (one row
-- per handoff). Read every 5 minutes through bot_handoffs_due by the
-- "Handoff Reminder" schedule, which then PATCHes reminded_at.
-- A handoff counts as answered as soon as anyone from the business writes in
-- that chat (chat_messages.role = 'agent') after the alert.
-- Additive only: no existing table or column is touched.

create table if not exists public.bot_handoffs (
  id          bigint generated always as identity primary key,
  chat_id     text        not null,
  reason      text        not null,  -- wants_human | complaint | discount | order_status | asks_if_bot | frustrated | bot_loop
  name        text,
  last_text   text,
  alerted_at  timestamptz not null default now(),
  reminded_at timestamptz
);

create index if not exists bot_handoffs_pending_idx
  on public.bot_handoffs (alerted_at desc)
  where reminded_at is null;

-- Same posture as the other T-Center tables: RLS on, no anon policies; the n8n
-- workflow writes with the service-role key.
alter table public.bot_handoffs enable row level security;

-- Unanswered for 15+ minutes, not yet reminded, and not older than the 12h
-- silence window (after that the bot is talking again anyway).
create or replace view public.bot_handoffs_due
with (security_invoker = true) as
select h.id, h.chat_id, h.reason, h.name, h.last_text, h.alerted_at
from public.bot_handoffs h
where h.reminded_at is null
  and h.alerted_at < now() - interval '15 minutes'
  and h.alerted_at > now() - interval '12 hours'
  and not exists (
    select 1 from public.chat_messages m
    where m.chat_id = h.chat_id
      and m.role = 'agent'
      and m.created_at > h.alerted_at
  );
