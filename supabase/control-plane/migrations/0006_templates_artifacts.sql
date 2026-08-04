-- BotOps Phase 6 — bot templates, immutable versioned artifacts, and versions.
-- An artifact (workflow | prompt | schema) is content-hashed and immutable; an
-- edit creates a NEW version (parent_version link); rollback re-deploys a prior
-- one. RLS-on (Management SQL bypasses; anon/auth get nothing). Idempotent.

create table if not exists botops.bot_templates (
  id                text primary key,         -- e.g. 'tcenter-sales'
  name              text not null,
  version           int not null default 1,
  source_workflow_id text,
  bindings          jsonb,                    -- the tokens manifest (no secret values)
  required_secrets  text[] not null default '{}',
  required_config   text[] not null default '{}',
  prompt_token      text,
  credentials       text[] not null default '{}',
  created_at        timestamptz not null default now()
);

create table if not exists botops.bot_artifacts (
  id            bigint generated always as identity primary key,
  bot_id        uuid references botops.bots(id) on delete cascade,
  kind          text not null check (kind in ('workflow','prompt','schema')),
  content       text not null,
  content_hash  text not null,
  version       int not null,
  parent_version int,
  is_current    boolean not null default false,
  created_by    uuid,
  created_at    timestamptz not null default now()
);
create index if not exists idx_artifacts_bot on botops.bot_artifacts(bot_id, kind, version);
create unique index if not exists uq_artifacts_current
  on botops.bot_artifacts(bot_id, kind) where is_current;

create table if not exists botops.bot_versions (
  id           bigint generated always as identity primary key,
  bot_id       uuid references botops.bots(id) on delete cascade,
  label        text,
  artifact_ids jsonb not null default '[]',
  created_at   timestamptz not null default now()
);
create index if not exists idx_versions_bot on botops.bot_versions(bot_id, created_at);

alter table botops.bot_templates  enable row level security;
alter table botops.bot_artifacts  enable row level security;
alter table botops.bot_versions   enable row level security;

-- Seed the tcenter-sales template (manifest only — no secret values) so a fresh
-- control-plane rebuild satisfies provisioning_jobs.template_id's FK. Idempotent.
insert into botops.bot_templates
  (id, name, version, source_workflow_id, required_secrets, required_config, prompt_token, credentials)
values (
  'tcenter-sales', 'T-CENTER Sales Bot', 1, 'KIIGQZPxugci8i1j',
  array['GEMINI_API_KEY','EZCOUNT_API_KEY'],
  array['SUPABASE_REF','NOTIFY_GROUP_ID','DEVELOPER_EMAIL','BOT_NAME'],
  'SYSTEM_PROMPT',
  array['supabaseApi','googlePalmApi','httpHeaderAuth','smtp']
)
on conflict (id) do nothing;
