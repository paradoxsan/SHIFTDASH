-- BotOps Phase 7 — provisioning pipeline as a persisted, resumable, idempotent
-- state machine with three non-skippable human checkpoints (pay / QR / prompt).
-- The agent/server is not a daemon, so EVERY transition is persisted: a killed
-- job resumes from current state, and each step is locate-or-create (Fix D — a
-- paid project is never compensating-deleted). RLS-on. Idempotent.

create table if not exists botops.provisioning_jobs (
  id           uuid primary key default gen_random_uuid(),
  tenant_name  text not null,
  template_id  text not null references botops.bot_templates(id),
  bot_id       uuid references botops.bots(id) on delete set null,
  state        text not null default 'draft'
                 check (state in ('draft','awaiting_pay_approval','creating_db',
                   'deploying_workflow','awaiting_qr','awaiting_prompt_approval',
                   'activating','live','failed','rejected','cancelled')),
  params       jsonb not null default '{}',     -- accumulated step outputs (ids, refs…)
  error        text,
  mode         text not null default 'live' check (mode in ('live','simulate')),
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_prov_jobs_state on botops.provisioning_jobs(state, updated_at);

create table if not exists botops.provisioning_checkpoints (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid not null references botops.provisioning_jobs(id) on delete cascade,
  kind             text not null check (kind in ('pay_approval','qr_pairing','prompt_approval')),
  status           text not null default 'pending' check (status in ('pending','approved','rejected')),
  approver_user_id uuid,
  decided_at       timestamptz,
  note             text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_prov_cp_job on botops.provisioning_checkpoints(job_id, kind);

create table if not exists botops.deployments (
  id              uuid primary key default gen_random_uuid(),
  bot_id          uuid references botops.bots(id) on delete cascade,
  job_id          uuid references botops.provisioning_jobs(id) on delete set null,
  version_id      bigint,
  n8n_workflow_id text,
  activated_at    timestamptz,
  rolled_back_from uuid,
  created_at      timestamptz not null default now()
);
create index if not exists idx_deploy_bot on botops.deployments(bot_id, created_at);

alter table botops.provisioning_jobs        enable row level security;
alter table botops.provisioning_checkpoints enable row level security;
alter table botops.deployments              enable row level security;
