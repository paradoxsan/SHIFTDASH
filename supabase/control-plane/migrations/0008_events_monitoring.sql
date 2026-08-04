-- BotOps Phase 8 — always-on monitoring: typed events (deduped), per-bot health
-- rollup, and notification subscriptions/log. The monitor (Vercel Cron) diffs
-- each bot's signals and writes events here; a PARTIAL-unique index on dedup_key
-- (open/ack only) means an ongoing condition yields exactly ONE open event and
-- re-runs are no-ops, while a resolved condition can recur. RLS-on. Idempotent.

create table if not exists botops.dashboard_events (
  id          bigint generated always as identity primary key,
  bot_id      uuid references botops.bots(id) on delete cascade,
  tenant_id   uuid references botops.tenants(id) on delete cascade,
  type        text not null,
  severity    text not null default 'info' check (severity in ('info','low','medium','high','critical')),
  dedup_key   text not null,
  payload     jsonb,
  status      text not null default 'open' check (status in ('open','ack','resolved')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
-- One OPEN (or ack'd) event per dedup_key; resolved events drop out so the
-- condition can recur later. This is what makes dispatch idempotent.
create unique index if not exists uq_events_open
  on botops.dashboard_events(dedup_key) where status <> 'resolved';
create index if not exists idx_events_bot on botops.dashboard_events(bot_id, created_at);
create index if not exists idx_events_status on botops.dashboard_events(status, severity, created_at);

create table if not exists botops.bot_health (
  bot_id             uuid primary key references botops.bots(id) on delete cascade,
  last_checked       timestamptz,
  queue_failed       integer,
  queue_stuck        integer,
  oldest_new_age_min integer,
  n8n_error_rate_24h numeric,
  workflow_active    boolean,
  status             text,  -- healthy | degraded | down | unknown
  updated_at         timestamptz not null default now()
);

create table if not exists botops.notification_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references botops.app_users(id) on delete cascade,
  channel      text not null check (channel in ('web_push','telegram','email','log')),
  target       text,
  event_types  text[] not null default '{}',   -- empty = all types
  min_severity text not null default 'high',
  created_at   timestamptz not null default now()
);

create table if not exists botops.notification_log (
  id              bigint generated always as identity primary key,
  event_id        bigint references botops.dashboard_events(id) on delete cascade,
  subscription_id uuid,
  channel         text,
  status          text,  -- sent | failed | skipped
  detail          text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_notiflog_event on botops.notification_log(event_id);

alter table botops.dashboard_events           enable row level security;
alter table botops.bot_health                 enable row level security;
alter table botops.notification_subscriptions enable row level security;
alter table botops.notification_log           enable row level security;
