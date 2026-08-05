-- What each client agreed to pay me, and how that links to Morning.
--
-- Keyed on TENANT, not bot: the contract is with the business, and a business
-- can end up running more than one bot without signing a second agreement.
--
-- `morning_client_id` is the join that answers "did this client pay this month".
-- It is picked once per client from Morning's own client list in the UI, because
-- name matching between the control-plane and an accounting system is exactly
-- the kind of fuzzy link that silently attributes the wrong invoice.
--
-- Fees are stored on the contract rather than derived from invoice line items:
-- the split between a one-off setup and monthly maintenance is a fact about the
-- agreement, and reading it back out of free-text invoice rows is guesswork.
-- RLS-on. Idempotent.

create table if not exists botops.client_contracts (
  tenant_id         uuid primary key references botops.tenants(id) on delete cascade,
  contact_name      text,
  contact_phone     text,
  contact_email     text,
  started_on        date,
  setup_fee         numeric(12,2),
  monthly_fee       numeric(12,2),
  currency          text not null default 'ILS',
  billing_status    text not null default 'active'
                      check (billing_status in ('active','paused','churned')),
  morning_client_id text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Two clients pointing at the same Morning customer would double-count revenue
-- and cross-attribute overdue invoices. Partial so unlinked clients are fine.
create unique index if not exists uq_contract_morning_client
  on botops.client_contracts(morning_client_id)
  where morning_client_id is not null;

create index if not exists idx_contracts_billing_status
  on botops.client_contracts(billing_status);

alter table botops.client_contracts enable row level security;
