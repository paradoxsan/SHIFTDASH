-- BotOps Phase 9 — analytics/AI auditability. `digests` caches the daily AI
-- brief (one Claude call/day/scope); `ai_query_log` records EVERY NL-query
-- attempt (allowed or rejected) so the SELECT-only guard is auditable. No core
-- data-model change. RLS-on. Idempotent.

create table if not exists botops.digests (
  id         bigint generated always as identity primary key,
  date       date not null,
  scope      text not null default 'all',
  summary    jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_digest_date_scope on botops.digests(date, scope);

create table if not exists botops.ai_query_log (
  id            bigint generated always as identity primary key,
  user_id       uuid references botops.app_users(id) on delete set null,
  prompt        text not null,
  generated_sql text,
  allowed       boolean not null default false,
  reason        text,
  row_count     integer,
  created_at    timestamptz not null default now()
);
create index if not exists idx_aiqlog_created on botops.ai_query_log(created_at);

alter table botops.digests       enable row level security;
alter table botops.ai_query_log  enable row level security;
