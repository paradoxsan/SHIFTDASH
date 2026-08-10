-- Follow-up sequence for stalled T-CENTER orders (BotOps Phase 7).
-- Goal: nudge customers who reached a closed order + payment link but went
-- silent, WITHOUT ever nudging someone who already paid or whom a rep is
-- actively handling. Fully idempotent — safe to re-run.
--
-- IMPORTANT context that shaped every guard below:
--   * orders.status is an UNRELIABLE payment signal. The EZcount paid webhook
--     does not reliably flip 'open' -> 'paid', so a large share of 'open' rows
--     were in fact paid (customer wrote "שילמתי", or is already asking about
--     pickup). Firing a payment reminder at them is a real-money embarrassment.
--   * A rep taking over does NOT set status; it sets human_mode.silenced_until.
--     human_mode.active is sticky (stays true forever) so it is NOT a usable
--     gate. The live "rep is handling this right now" signal is
--     silenced_until > now(), plus a recent agent message.
--
-- Therefore the "due" view re-checks all of these at query time, so a rep
-- closing/answering the order between runs instantly removes it from the queue.

-- Log of everything we sent, so we never double-send a step and can re-check
-- state at send time.
create table if not exists public.followup_log (
  id       bigint generated always as identity primary key,
  chat_id  text    not null,
  order_id bigint,
  step     integer not null,
  message  text,
  sent_at  timestamptz not null default now()
);
create index if not exists idx_followup_log_chat on public.followup_log(chat_id, sent_at);
alter table public.followup_log enable row level security;

-- Single-row config. started_at is the go-live cutoff: only orders created at
-- or after this moment are ever eligible, so switching the feature on does NOT
-- blast the historical backlog of stalled orders — it applies to NEW orders
-- only ("רק על שיחות חדשות"). Seeded to now() on first apply and never reset.
create table if not exists public.followup_config (
  id         integer primary key default 1,
  started_at timestamptz not null default now(),
  constraint followup_config_singleton check (id = 1)
);
insert into public.followup_config (id) values (1) on conflict (id) do nothing;
alter table public.followup_config enable row level security;

-- ---------------------------------------------------------------------------
-- tc_followup_due: rows that are eligible AND timing-due RIGHT NOW.
-- n8n selects from this on an hourly cron, applies the business-hours window,
-- sends `message`, then inserts into followup_log(chat_id, order_id, step).
-- One row per chat. `message` is fully rendered and personalised.
-- ---------------------------------------------------------------------------
create or replace view public.tc_followup_due as
with latest_order as (
  select distinct on (chat_id)
         chat_id, id as order_id, status, order_snapshot, total, invoice_name,
         created_at as order_at
  from public.orders
  order by chat_id, created_at desc
),
msg as (
  select chat_id,
    max(created_at) filter (where role in ('bot','agent')) as last_out_at,
    max(created_at) filter (where role = 'user')           as last_user_at,
    max(created_at) filter (where role = 'agent')          as last_agent_at,
    bool_or(role='user' and text ~ '(שילמתי|שולם|העברתי|העברנו|שילמנו|ביצעתי תשלום|בוצע)') as said_paid,
    bool_or(role='user' and text ~ '(מתי.*לקחת|מתי.*מוכן|לאיסוף|לבוא לקחת)')              as asked_pickup,
    bool_or(role='bot'  and text ~ 'התשלום התקבל')                                        as bot_confirmed_paid
  from public.chat_messages
  group by chat_id
),
fu as (
  select chat_id, count(*) as sent, max(sent_at) as last_fu_at
  from public.followup_log
  group by chat_id
),
cand as (
  select
    lo.chat_id,
    lo.order_id,
    coalesce(nullif(cm.display_name,''), nullif(lo.invoice_name,'')) as name,
    coalesce(nullif(lo.order_snapshot->>'desc',''),
             nullif(lo.order_snapshot->>'product',''),
             'ההזמנה שלך')                                           as item,
    lo.total,
    coalesce(cm.order_count, 0) as order_count,
    coalesce(fu.sent, 0)        as sent,
    case
      when coalesce(fu.sent,0)=0 and now() - m.last_out_at  >= interval '24 hours' then 1
      when coalesce(fu.sent,0)=1 and now() - fu.last_fu_at  >= interval '72 hours' then 2
      when coalesce(fu.sent,0)=2 and now() - fu.last_fu_at  >= interval '96 hours' then 3
      else 0
    end as next_step
  from latest_order lo
  join msg m on m.chat_id = lo.chat_id
  left join public.customer_memory cm on cm.chat_id = lo.chat_id
  left join fu on fu.chat_id = lo.chat_id
  where lo.status = 'open'                                    -- rep/system hasn't closed or cancelled it
    and lo.order_at >= (select started_at from public.followup_config where id = 1)  -- new orders only
    and coalesce(fu.sent,0) < 3                               -- max 3 touches
    and m.last_out_at >= coalesce(m.last_user_at, 'epoch')    -- WE spoke last (nudge segment)
    and coalesce(m.said_paid, false)          = false         -- customer never said they paid
    and coalesce(m.asked_pickup, false)       = false         -- not already at pickup
    and coalesce(m.bot_confirmed_paid, false) = false         -- bot never acked a payment
    and (m.last_agent_at is null or now() - m.last_agent_at >= interval '24 hours')  -- rep not engaged
    and not exists (                                          -- rep not in an active takeover pause
      select 1 from public.human_mode hm
      where hm.chat_id = lo.chat_id
        and hm.silenced_until is not null
        and hm.silenced_until > now()
    )
)
select
  chat_id, order_id, next_step as step, name, item, total, order_count,
  case
    when next_step = 1 and order_count > 1 then
      'היי' || coalesce(' '||name,'') || ' 🙂 כיף לראות אותך שוב. נשאר רק להשלים את התשלום על ההזמנה ואנחנו עולים להדפסה. לשלוח לך את הלינק?'
    when next_step = 1 then
      'היי' || coalesce(' '||name,'') || ' 🙂 ראיתי שלא סיימנו את ההזמנה של ' || item || '. נשאר רק התשלום ואנחנו מעלים להדפסה. שאשלח לך שוב את הלינק?'
    when next_step = 2 then
      'היי' || coalesce(' '||name,'') || ', שומרים לך את ההזמנה 🙏 ברגע שהתשלום נכנס אנחנו מתחילים. יש משהו שתרצה לבדוק לפני שסוגרים? כמות, מידות או העיצוב?'
    when next_step = 3 then
      'היי' || coalesce(' '||name,'') || ', רק לבדוק אם ההזמנה עדיין רלוונטית. אם כן אשלח לינק ונסגור בדקה. אם משהו עצר אותך תכתוב לי ונמצא פתרון 🙂'
  end as message
from cand
where next_step > 0;
