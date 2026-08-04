-- BotOps — business-level n8n organization ("a folder per business" onboarding
-- rule). This n8n instance's license does NOT expose projects (/projects → 403)
-- and the public API has no folders (/folders → 404), so the achievable grouping
-- primitive is a per-business TAG + a "<Business> — <Bot>" workflow naming
-- convention. n8n_folder_id / n8n_project_id are RESERVED for when the instance
-- gains folder/project support — callers switch with no schema change. Org lives
-- at the tenant (business) level so every bot of a business shares one folder.
-- Idempotent.

alter table botops.tenants add column if not exists org_label      text; -- display/tag/prefix name (= business name)
alter table botops.tenants add column if not exists n8n_tag_id      text; -- n8n tag id grouping this business's workflows
alter table botops.tenants add column if not exists n8n_folder_id   text; -- reserved: real n8n folder id (when supported)
alter table botops.tenants add column if not exists n8n_project_id  text; -- reserved: n8n project id (enterprise)

-- Backfill org_label from the existing tenant name so current businesses are labelled.
update botops.tenants set org_label = name where org_label is null;
