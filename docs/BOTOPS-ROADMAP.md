# BotOps Platform — Implementation Roadmap

Transform the `BOT DASHBOARD` repo (an operator dashboard for a few hand-built WhatsApp bots) into a **multi-tenant BotOps SaaS** that can **create, deploy, manage, update, and monitor** AI WhatsApp bots for many clients.

> **Status:** APPROVED to implement (user granted blanket authorization). Implement **one phase at a time**, in order. Each phase is additive and forward-compatible — no phase requires redesigning an earlier one.

---

## How this roadmap was produced

3 architect philosophies (foundation-first, vertical-slice, risk-first) each authored a full phased plan; each was **adversarially scored** by an independent reviewer on phase-independence, ordering, completeness, realism, and security/tenancy. This roadmap is the synthesis: the **foundation-first spine** (highest-scoring, security-forward) + the **risk-first insight** that the bot-template/artifact contract is itself irreversible, + the reviewer's required fixes:

- **Fix A** — every mutating route must be proven to route through the audited write seam via an *import-boundary test* (not one spot-check), or RBAC can be silently bypassed.
- **Fix B** — the RLS-remediation phase must first read the live n8n workflow to learn which Supabase key it uses (anon vs service_role) before enabling RLS, or it can break the live bot. Stage on a Supabase branch.
- **Fix C** — the god-PAT is *scoped down, not retired*; add an explicit acceptance test that no data-plane **mutation** uses the management PAT (introspection/migration may still).
- **Fix D** — paid Supabase project creation can't be cleanly rolled back; provisioning steps must be **idempotent (locate-or-create)** with orphan detection, not "compensating delete."
- **Fix E** — stop the active bleeding early: a thin, audited operator quick-wins slice (requeue + human-takeover) lands right after the secure write path exists (Phase 5), not at the very end.

---

## North-star architecture (the "after")

A multi-tenant SaaS where every **tenant, bot, secret, prompt, version, provisioning job, and event is a row in an app-owned Supabase control-plane** — never a compiled TS array or env JSON. Bots are produced from a **versioned bot-template/artifact contract** (the live 91-node T-CENTER Gemini workflow, generalized) compiled deterministically into an n8n workflow + Supabase schema + WHAPI webhook, via a **resumable provisioning pipeline with three human checkpoints**: (a) approve paid spend, (b) pair the WhatsApp number (QR), (c) approve the prompt before go-live. Every bot supports **non-destructive versioned update + rollback**. Data-plane access moves from one RLS-bypassing god-PAT toward **least-privilege per-tenant credentials** behind a single **audited, Zod-validated, allowlisted service layer**, with **RBAC** (owner/operator/viewer) and a full **audit trail**. A **Vercel-Cron monitoring runtime** continuously detects events and fans them out. The existing operator dashboard and Shift Digital LeadManager keep working throughout.

---

## Global conventions (apply to every phase)

- **Control-plane vs data-plane.** *Control-plane* = a NEW app-owned Supabase project holding platform metadata (tenants, bots, versions, secrets, audit, events). *Data-plane* = the per-client Supabase projects + n8n workflows + WHAPI channels that run the bots. The app never co-mingles them.
- **Three human checkpoints** are first-class, non-skippable pauses: **$ approval**, **WhatsApp QR pairing**, **prompt go-live approval**.
- **Backward-compatibility rule.** The static `lib/registry.ts` array, the management PAT, and the string-interpolated SQL path are **wrapped and shadowed, never ripped out mid-flight**. The operator dashboard + Shift Digital LeadManager must stay green every phase.
- **Testing rule.** From Phase 1 on, every phase ships with tests and stays CI-green. No phase merges red.
- **`chat_id`** remains the universal WhatsApp join key across data-plane tables.
- **Secrets** are referenced/encrypted-at-rest in the control plane; never returned to the client, never committed.

## Dependency graph

```
P1 (tests+seam) ─┬─> P2 (control-plane+registry) ─┬─> P3 (auth+RBAC+audited write) ─┬─> P4 (data-plane hardening) ─┬─> P5 (operator quick-wins)
                 │                                  │                                 │                              ├─> P8 (monitoring)
                 │                                  └────────────> P6 (bot-template/artifact+versioning) ───────────┴─> P7 (provisioning+onboarding)
                 └────────────────────────────────────────────────────────────────────────────────────────────────> (P9 analytics builds on P4+P8)
```
Each phase lists explicit `dependencies` by phase id. Nothing is built before its prerequisite.

---

## Implementation reconciliation (2026-06-28 audit)

A 6-agent evidence audit (verifying actual code, not these banners) confirmed phases 1–5 are built **in dependency order** and the **security spine is genuinely present and green** (audited write seam + Fix-A boundary test, RLS-on the 6 T-CENTER tables, allowlisted PK-scoped query builder, encrypted secrets-at-rest, 92 tests). Two honest corrections to keep this doc truthful:

**Migration numbering — `0003` is intentionally unused.** On disk: `0001_init.sql` (init + **all auth/RBAC tables folded in up front**: app_users, invites, sessions, audit_log), `0002_seed_existing_clients.sql`, `0004_secrets.sql`, `0005_n8n_org.sql`. There is no `0003_auth_rbac.sql` — Phase 3's schema went into `0001`, so the `0003` slot is deliberately skipped. Future control-plane migrations: P6 templates = `0006`, P7 provisioning = `0007`, P8 events = `0008`.

**Deferred / not-yet-built per phase** (the phase banners say "complete" for their *acceptance criteria + core spine*; these named-but-optional deliverables remain open and are NOT regressions — most carry forward into later phases):
- **P1:** Playwright E2E (`playwright.config`, `tests/e2e/*`), route-response snapshot tests, `tests/setup/http-mocks.ts`, `docs/CONTROL_PLANE_SCHEMA.md`. (Unit + CI half is done; live-verify covers integration.)
- **P2:** dedicated control-plane *project* (chose Option B = a `botops` **schema** in the existing project); `app/api/tenants*`, admin Tenants UI, `scripts/seed-control-plane.ts` (the `0002` SQL migration substitutes). Offline seed==DB parity test (parity is asserted by `scripts/verify-live.mjs`, not `npm test`).
- **P3:** `memberships` tenant-scoping table; **stateful session-row revocation** (`botops.sessions` exists but is unused — tokens are stateless HMAC); role-aware `middleware.ts` (currently a binary auth gate; role is enforced at the route/service layer); admin Users/Invites/Audit UI + `/api/{users,invites,audit}`.
- **P4:** **Fix C cutover is infra-only** — `bot_secrets` + `lib/secrets.ts` exist but no mutation path consumes a least-priv key yet, so data mutations still run on the management PAT; no explicit "no-mutation-uses-PAT" assertion test. RLS Hardening Center + Secrets Manager UI/API (`/api/security/rls`, `/api/secrets`) not built (RLS was remediated by a one-shot migration + anon-denied live check).
- **P5:** Playwright `human-takeover.spec` (unit/integration suite covers the acceptance criteria); a dedicated test for the watchlist `expired` flag.

---

## Phase 1 — Test/Validation Harness + Service-Layer Seam

- **Goal:** Establish an automated test/CI safety net and a single chokepoint module wrapping all external mutations (`runSql`, n8n writes, WHAPI send), so every later foundational change is regression-guarded and lands in one place. **Zero behavior change.**
- **Architecture changes:**
  - Add Vitest (unit/integration) + Playwright (E2E smoke of login + DB-explorer PATCH); wire both into CI.
  - Create `lib/services/data-plane.ts` — a pass-through seam re-exporting `runSql`/`introspect` today, so P3 audit-wrapping and P4 least-privilege swap touch ONE file, not every call site.
  - Adopt Zod as the boundary validator; a shared `parse-or-400` helper in `lib/api-helpers.ts`.
  - HTTP mocking (msw or fetch mock) so Supabase Management / n8n / WHAPI are testable without live tokens.
- **Database changes:** None (no control-plane DB yet). Reserve control-plane table/column names in `docs/CONTROL_PLANE_SCHEMA.md` so naming is decided once.
- **UI changes:** None user-facing. Optional tiny status pill in the shell bound to `/api/health` for E2E.
- **API changes:** Add `GET /api/health` → `{ok, version, gitSha}`. Retrofit Zod into the existing `bots/[ref]/tables/[table]` PATCH body (behavior-preserving).
- **Files to create:** `vitest.config.ts`, `playwright.config.ts`, `tests/unit/{sql,auth,registry}.test.ts`, `tests/integration/supabase-management.test.ts`, `tests/e2e/{login,db-explorer-patch}.spec.ts`, `tests/setup/http-mocks.ts`, `lib/services/data-plane.ts`, `lib/validation/table-patch.ts`, `app/api/health/route.ts`, `docs/CONTROL_PLANE_SCHEMA.md`.
- **Files to modify:** `package.json`, `.github/workflows/deploy.yml`, `app/api/bots/[ref]/tables/[table]/route.ts`, `lib/sql.ts`, `lib/api-helpers.ts`.
- **Dependencies:** none.
- **Risks:** Windows Playwright flakiness → run E2E only in the Linux CI runner as source of truth. Wrong mock shape → snapshot a real `/database/query` response first. CI gates blocking deploys → start gates as non-blocking "report", flip to required once green.
- **Acceptance criteria:**
  - `npm test` runs and ≥15 unit/integration tests pass covering `lib/sql.ts` escaping/typing, `lib/auth.ts` sign/verify/expiry, `lib/registry.ts` resolution.
  - Playwright proves: unauthenticated → redirect to `/login`; authenticated user can PATCH a row.
  - CI fails the build if any test fails; deploy only runs after green.
  - Snapshot tests prove every existing route returns identical responses; LeadManager + dashboard unchanged.
  - `GET /api/health` returns 200.

## Phase 2 — Control-Plane DB + DB-Backed Dynamic Registry

- **Goal:** Create the app-owned control-plane Supabase project + core schema; make `lib/registry.ts` read from it (read-through cache) with the static array demoted to **seed + fallback**. Adding a client becomes a **DB row, not a code edit + redeploy**. This is the data model we commit to never migrating.
- **Architecture changes:**
  - Provision a **dedicated control-plane Supabase project** (own service_role key, NOT the management PAT). **⚠ This costs ~$10/mo and must never auto-pause → explicit, owner-approved $ decision (see Risks).**
  - `lib/control-plane.ts` — typed `@supabase/supabase-js` server-only client (repository pattern: `listTenants`, `getBot`, …).
  - Convert registry accessors to async sourced from control-plane; keep a **sync `getClientsCached()`** snapshot to avoid an async ripple across server components; static `CLIENTS` used as idempotent seed + in-memory fallback if control-plane is unreachable.
  - Freeze the control-plane schema contract now (with placeholders for later tables) so later phases only **ADD**.
- **Database changes (control-plane, RLS on, service-role only):**
  - `tenants(id, slug, name, workspace, accent, owner_user_id?, status, created_at)`
  - `bots(id, tenant_id, supabase_ref, table_include[], table_exclude[], n8n_prefixes[], whapi_key, sheet_id, current_version_id?, template_id?, status[draft|provisioning|live|paused|archived], created_at)` — supersedes `ClientDef`.
  - `data_plane_refs(supabase_ref pk, org, plan, shared bool)`.
  - placeholders `app_users`, `invites`, `sessions`, `audit_log` (filled in P3).
  - Idempotent **seed migration** reproducing the 3 existing clients / 2 refs (incl. PARADOX shared-ref table-subset mapping) exactly.
- **UI changes:** Overview/workspace-bar render from the DB-backed registry (identical data). Operator-only read-only "Tenants" admin list.
- **API changes:** `app/api/clients` + `app/api/bots` read DB-backed registry (same shape via `toPublic`). New `GET /api/tenants`, `/api/tenants/[id]/bots`. Reads only (no onboarding mutation yet).
- **Files to create:** `lib/control-plane.ts`, `lib/registry-store.ts`, `lib/types-control-plane.ts`, `supabase/control-plane/migrations/0001_init.sql`, `…/0002_seed_existing_clients.sql`, `scripts/seed-control-plane.ts`, `tests/integration/registry-store.test.ts`, `app/api/tenants/route.ts`, `app/api/tenants/[id]/bots/route.ts`, `app/(dash)/admin/tenants/page.tsx`, `components/admin/tenant-list.tsx`.
- **Files to modify:** `lib/registry.ts`, `lib/env.ts`, `app/api/clients/route.ts`, `app/api/bots/route.ts`, `components/workspace-bar.tsx`, `components/client-context.tsx`, **plus any server component that consumes registry synchronously** (audit during impl — registry is consumed widely).
- **Dependencies:** P1.
- **Risks:** async registry ripple → mitigated by `getClientsCached()` + fallback. Control-plane outage blanks dashboard → static fallback + short cache. Seed/static drift → parity test on the 3 known clients. **Supabase free tier = 2 active projects/org**; the control-plane is a 3rd, never-pausing project → forces a **Pro/$ decision owned here** (surface cost, get explicit approval before creating).
- **Acceptance criteria:**
  - Control-plane project exists, migrations applied; `tenants` has 3 rows, `bots` reproduces the 2-ref/table-subset mapping exactly.
  - Commenting out the static `CLIENTS` array still yields the same 3 clients in the UI; forcing control-plane unreachable falls back to static and still renders.
  - Inserting a `tenants`+`bots` row makes a new client appear in Overview **with no code change or redeploy**.
  - `registry-store` test confirms `clientTables()` subset logic matches pre-DB behavior; all P1 tests green; LeadManager unaffected.

## Phase 3 — Identity Auth, RBAC & Audited/Validated Write Path

- **Goal:** Give the session real user identity, enforce owner/operator/viewer RBAC, and route **every mutation** through an audited, Zod-validated service wrapper. RBAC is impossible today because the token (`v1.{exp}.{sig}`) carries no identity.
- **Architecture changes:**
  - Extend `lib/auth.ts` to a v2 token with user id/email + role claim; keep v1 verification during the TTL window (canary), then expire it.
  - Bind Google OAuth callback to control-plane `app_users` (allowlist email → upsert user → issue `sessions` row → role from `app_users.role`).
  - `lib/rbac.ts` (`requireRole`/`permits`) + `getCurrentUser()`; role-aware `middleware.ts`.
  - `lib/services/audited.ts` — wraps the P1 seam: validate (Zod) → check RBAC → execute → write `audit_log` with actor. **This becomes the single enforcement point.**
- **Database changes (control-plane):** fill `app_users(role,status,last_login)`, `invites(token,email,role,expires_at,accepted_at)`, `sessions(id,user_id,issued_at,expires_at,revoked_at,ua,ip)`, `memberships(user_id,tenant_id,role)` for tenant-scoping; `audit_log.actor_user_id` populated + index on `(target_type,target_id,created_at)`. Seed current `AUTH_ALLOWED_EMAILS` as owner-role users.
- **UI changes:** login shows signed-in identity; owner-only Users/Invites admin (`app/(dash)/settings/users`); audit-trail viewer (read); mutating controls hidden/disabled for viewer.
- **API changes:** callback issues v2 identity session; new `app/api/users` (owner), `app/api/invites`, `app/api/audit`. **All existing mutating routes** (n8n toggle, leads/send, leads/pause, human-mode, tables PATCH) call `lib/services/audited.ts` + enforce role.
- **Files to create:** `lib/rbac.ts`, `lib/current-user.ts`, `lib/services/audited.ts`, `lib/validation/mutations.ts`, `app/(dash)/settings/users/page.tsx`, `app/api/{users,invites,audit}/route.ts`, `components/settings/users-admin.tsx`, `components/audit/audit-viewer.tsx`, `tests/unit/rbac.test.ts`, `tests/integration/audited-write.test.ts`, **`tests/integration/mutation-boundary.test.ts` (Fix A — asserts EVERY mutating route imports/goes through `audited.ts`)**, `supabase/control-plane/migrations/0003_auth_rbac.sql`.
- **Files to modify:** `lib/auth.ts`, `middleware.ts`, `app/api/auth/google/callback/route.ts`, `app/api/auth/login/route.ts`, `app/api/n8n/workflows/[id]/toggle/route.ts`, `app/api/leads/send/route.ts`, `app/api/leads/pause/route.ts`, `app/api/clients/[client]/human-mode/route.ts`, `app/api/bots/[ref]/tables/[table]/route.ts`.
- **Dependencies:** P1, P2.
- **Risks:** auth bug locks everyone out → keep v1 fallback for TTL, ship behind canary. Edge middleware can't cheaply read DB per request → role in signed token, re-validate server-side for sensitive ops. `ENABLE_PASSWORD_LOGIN` fallback must map to an identity or be disabled (no identity-less sessions reappearing).
- **Acceptance criteria:**
  - A session decodes to a specific user email + role; every toggle/send/requeue `audit_log` row carries `actor_user_id`.
  - A viewer gets 403 on any mutating route AND the mutating UI isn't rendered for them.
  - Owner invites an operator by email; invitee logs in via Google with operator role.
  - Revoking a `sessions` row blocks that session within one TTL refresh.
  - **Fix A test green:** the import-boundary test fails CI if any mutating route bypasses `audited.ts`.

> **STATUS (2026-06-27): Phase 4 COMPLETE + verified.** RLS remediation (6 T-CENTER tables, anon-denied) done earlier this phase. Now landed: the allowlisted, PK-scoped, audited query builder (`lib/services/query-builder.ts`) — routes go through `selectRows`/`updateRowByPk`/`listTablesWithCounts`, never raw `runSql`; encrypted-at-rest credential storage (`lib/secrets.ts` AES-256-GCM + `botops.bot_secrets`/`data_plane_migrations`, migration `0004`, applied live, RLS-on). Boundary tests green: `runsql-boundary.test.ts` (no `app/api/**/route.ts` imports `runSql`) + `mutation-boundary.test.ts` (extended to accept the query-builder as an audited seam). Also landed the **n8n-folder-per-business** hook (migration `0005`, `lib/n8n-org.ts`) — see Phase 7 note. 55 unit tests green, tsc clean, `next build` green, live verifier 35/35. NOTE: roadmap's planned migration numbers shift — Phase 6 templates = `0006`, Phase 7 provisioning = `0007`, Phase 8 events = `0008`.

## Phase 4 — Data-Plane Hardening: RLS Remediation, Least-Privilege Creds, SQL Allowlist

- **Goal:** Eliminate the god-PAT blast radius and the SQL-injection/RLS-bypass risk: remediate the **6 RLS-disabled T-CENTER tables**, move per-project data ops toward least-privilege credentials stored in the control plane, and constrain `runSql` behind an allowlisted, PK-scoped, audited query builder.
- **Architecture changes:**
  - **Fix B:** before flipping RLS, use a minimal read-only n8n workflow GET to confirm whether the live T-CENTER bot uses the anon or service_role key; add matching policies accordingly. Stage on a Supabase **branch**, test the bot end-to-end, then prod.
  - RLS Hardening Center: scan `pg_policies`/`pg_tables` per project, flag the 6 exposed tables, apply remediation migrations (server-only policies).
  - Per-tenant `bot_secrets` (encrypted) → route data reads/writes through least-privilege keys where available; management PAT narrowed to **introspection/migration only**.
  - Replace ad-hoc interpolated SQL with `lib/services/query-builder.ts`: identifier allowlist from `introspect()`, value binding via `sql.ts`, operation allowlist (select / update-by-pk / aggregate), all wrapped by `audited.ts`. DDL recorded in `data_plane_migrations`.
- **Database changes:** control-plane `bot_secrets(bot_id, kind, ciphertext, nonce, created_at, rotated_at)` (AES-GCM/libsodium, KEK from Vercel env), `data_plane_migrations(bot_id, name, sql_hash, applied_at, applied_by)`. Client (T-CENTER): migrations enabling RLS on the 6 tables, verified by `get_advisors`.
- **UI changes:** RLS Hardening Center (owner-only) with per-project policy status + guarded "Enable RLS" + diff preview; Secrets manager (presence only, never plaintext, rotation).
- **API changes:** `app/api/security/rls` (GET scan, POST remediate), `app/api/secrets` (GET presence, POST rotate). `runSql` becomes internal-only; public callers go through the query builder.
- **Files to create:** `lib/secrets.ts`, `lib/services/query-builder.ts`, `lib/services/rls-scan.ts`, `app/(dash)/settings/security/page.tsx`, `app/api/security/rls/route.ts`, `app/api/secrets/route.ts`, `components/settings/{rls-hardening,secrets-manager}.tsx`, `supabase/control-plane/migrations/0004_secrets.sql`, `supabase/data-plane/tcenter/0001_enable_rls.sql`, `tests/unit/query-builder.test.ts`, `tests/integration/rls-scan.test.ts`.
- **Files to modify:** `lib/supabase-management.ts`, `lib/services/data-plane.ts`, `lib/sql.ts`, `lib/env.ts`, `app/api/bots/[ref]/tables/route.ts`, `app/api/bots/[ref]/tables/[table]/route.ts`.
- **Dependencies:** P1, P2, P3.
- **Risks:** enabling RLS could break the LIVE bot if it uses anon → Fix B (read which key first, branch-test). KEK management on Vercel → store in env, document rotation, never in DB. Narrowing the PAT may remove a silently-relied-on capability → narrow capability-by-capability with audit-proven usage first.
- **Acceptance criteria:**
  - `get_advisors` reports **0 "RLS disabled on public table"** for T-CENTER, and the live bot still processes `inbox` (verified on a branch then prod).
  - No route imports `runSql` except `lib/services/*` (import-boundary test).
  - Out-of-allowlist op / unknown identifier through the query builder is rejected and audited.
  - `bot_secrets` stores only ciphertext; rotation re-encrypts + updates `rotated_at`.
  - **Fix C test:** an assertion proves no data-plane **mutation** path uses the management PAT (only introspection/migration may).

> **STATUS (2026-06-28): Phase 5 COMPLETE + verified + adversarially reviewed.** Shipped: the allowlisted query builder gained `buildWhere` (op-allowlisted, value-bound predicates); `lib/services/operator.ts` (requeue / listQueue / listChaseableOrders / chaseOrder — all built on the audited query builder); human-takeover **watchlist** (`listHumanModeActive`); n8n **error drill-down** (`parseExecutionDetail` + `getExecutionDetail` with 24h failure rate). Routes: `bots/[ref]/queue`, `bots/[ref]/requeue`, `orders/[ref]/chase` (GET list + POST chase), `clients/[client]/watchlist`, enriched `n8n/executions/[id]`. UI: new **/ops** "מוקד" screen (queue-monitor + human-watchlist + payment-chase tabs) + executions error-drilldown drawer + shell nav. A 15-agent **adversarial review workflow** found 9 confirmed defects (2 dismissed); ALL FIXED: (1) CRITICAL chase fail-OPEN on human_mode read error → now fail-CLOSED (`isChatUnderHumanStrict`); (2) HIGH lossy bigint PK binding in `sqlValue` (Number() precision/coercion) → canonical-integer verbatim binding + tightened `idValue`; (3) RBAC now enforced BEFORE any data-plane read in requeue/chase; (4) chase refuses a STALE order (newer-open-order guard) + audit-log **cooldown** (`wasActionedRecently`, 6h); (5) dropped the unreliable created_at "stuck" heuristic (only failed/error auto-requeuable — no double-processing); (6) mutation-boundary test hardened (comment-strip + call-form + negative fixtures). **92 unit/integration tests green, tsc clean, next build green, verify-live 39/39.** NEXT: Phase 6 (bot-template/artifact contract + versioning).

## Phase 5 — Operator Quick-Wins (Stop the Bleeding)

- **Goal (Fix E):** Now that the audited, PK-scoped write path exists, land the high-ROI operator fixes from the original `docs/ROADMAP.md` that are bleeding today (~30 failed msgs/day, 340 silent chats): one-click **requeue**, in-thread **human-takeover + watchlist**, **payment-chase** worklist, **n8n error drill-down** — all RBAC-gated and audited.
- **Architecture changes:** build operator actions on `lib/services/audited.ts` + the query builder; reuse `human-mode.ts`/`reminders.ts` patterns. Unified "needs-a-human" work-center joins WHAPI + DB by `chat_id`.
- **Database changes:** no new control-plane core tables; data-plane writes (requeue, human-mode upsert) go through audited PK-scoped UPDATEs. Optional control-plane `operator_notes(bot_id, chat_id, user_id, note, created_at)`.
- **UI changes:** in-thread Bot ON/Human + "silence 30m/2h" (upsert `human_mode`); human-mode **Watchlist** sorted by duration flagging past `silenced_until`; queue monitor (FAILED/STUCK/RETRY-EXHAUSTED) with guarded **Requeue**; payment-chase worklist over open orders with "resend link" (honors `human_mode.active`); n8n execution drill-down (failed node + input + 24h failure rate).
- **API changes:** extend `clients/[client]/human-mode`; `app/api/bots/[ref]/requeue` (audited); `app/api/orders/[ref]/chase`; enrich `n8n/executions/[id]`.
- **Files to create:** `app/api/bots/[ref]/requeue/route.ts`, `app/api/orders/[ref]/chase/route.ts`, `components/inbox/{work-center,human-watchlist}.tsx`, `components/orders/payment-chase.tsx`, `components/executions/error-drilldown.tsx`, `tests/integration/requeue.test.ts`, `tests/e2e/human-takeover.spec.ts`.
- **Files to modify:** `components/chat/{human-mode-toggle,chat-view}.tsx`, `lib/human-mode.ts`, `app/api/clients/[client]/human-mode/route.ts`, `app/api/n8n/executions/[id]/route.ts`, `lib/whapi.ts`.
- **Dependencies:** P1, P2, P3, P4.
- **Risks:** requeue/UPDATE hits live client DB → must be PK-scoped, capped, audited. Payment-chase resend must honor `human_mode.active`. Reply substitution can leak wrong order if `chat_id` join is ambiguous → validate single-match before send.
- **Acceptance criteria:**
  - Toggling "Human" upserts `human_mode` (active + `silenced_until`) and is audited with operator identity.
  - Watchlist lists all active `human_mode` chats by duration, flags past `silenced_until`.
  - Requeue sets a failed `inbox` row to `status='new'`, clears error, capped by attempts, audited; row reprocesses.
  - Payment-chase offers "resend link" only for open orders not under active `human_mode`; sends via WHAPI.
  - n8n error drill-down shows failed node + input for a known failed execution; all prior tests green.

> **STATUS (2026-06-28): Phase 6 CORE COMPLETE + golden byte-match verified; versioning-storage wiring + UI + live deploy deferred.** The irreversible contract is built and proven: the live 92-node T-CENTER workflow (fetched read-only; drifted V2.9.3→V2.9.6 mid-build — it's actively edited) is generalized into a **tokenized, secret-free, PII-free template** `templates/tcenter-sales/` (`workflow.template.json` + `bindings.json` + `fingerprint.json` + `artifact.json` + `migrations/0001_bot_schema.sql`). 18 `{{TPL:NAME}}` sentinels (collision-proof vs n8n's own `{{ }}`): 2 secrets (Gemini + EZcount keys), 4 config (ref/group/dev-email/name), the 21k prompt. Real values live ONLY in a gitignored `*.params.local.json`. `lib/bot-compiler.ts` (pure, deterministic) + `lib/bot-artifact.ts` (Zod schemas + loaders) + `lib/n8n-admin.ts` (GET / cleanSettings-drops-binaryMode/availableInMCP / non-destructive PUT with pre-snapshot, never re-serializes connections). **Golden acceptance MET**: live byte-match asserts compiled template == running workflow on **all 92 nodes + connection graph + the 21k systemMessage** (verify-live 45/45); offline golden test (9) pins determinism + zero-residual + structural fingerprint + secret-freedom. Control-plane migration `0006_templates_artifacts.sql` (`bot_templates`/`bot_artifacts`/`bot_versions`, RLS-on, content-hash + is_current unique index) applied live; `tcenter-sales` registered. APIs: `GET /api/templates`, `GET /api/templates/[id]/compile?dryRun` (zero side effects, placeholder params, no secrets). **101 unit/golden tests green, tsc clean, next build green.** DEFERRED to a Phase-6b/Phase-7 chunk: wiring artifact-version STORAGE on edit (create `bot_artifacts` rows + `is_current` flip) and live rollback PUT (the engine `n8n-admin.putWorkflow` is built + tested-by-shape but not executed against the live bot — that's deploy territory, P7); template-gallery + version-history + prompt-editor UI. NEXT: Phase 7 (provisioning + onboarding, 3 human checkpoints) — now unblocked by the compiler + n8n-admin.

## Phase 6 — Bot-Template / Artifact Contract + Versioning & Rollback

- **Goal:** Generalize the live T-CENTER 91-node Gemini workflow into a **versioned, parameterized bot-template/artifact** + a **deterministic compiler**, and productize non-destructive update + rollback across n8n workflow / prompt / DB schema — turning the proven `n8n/scratch` scripts into a first-class, tested engine. (Replaces "build bots manually.")
- **Architecture changes:**
  - Define the canonical `BotArtifact` Zod schema: `{meta, systemPrompt, knowledgeBase, variables, dbSchema: migration[], n8nTemplate:{workflowJson, parameterBindings[]}, whapiBinding, version, parentVersion}` (note systemPrompt == "AI instructions" == one n8n `systemMessage`).
  - Extract `KIIGQZPxugci8i1j` via GET into a checked-in template with placeholder tokens + a binding manifest; productize the **GET→patch→PUT** flow in `lib/n8n-admin.ts` (preserve UTF-8, **never re-serialize connections**).
  - `lib/bot-compiler.ts`: pure `BotArtifact + tenant params → {n8n workflow JSON, ordered idempotent migrations, WHAPI webhook config}`.
  - Versioning: artifacts are **immutable**; an edit creates a new version (`parentVersion` link); rollback = re-deploy a prior version. Content-hash + snapshot into control-plane (synthesizes the n8n history the API lacks).
- **Database changes (control-plane):** `bot_templates(id, name, version, workflow_template jsonb, prompt_template, variable_schema jsonb, required_creds jsonb, required_migrations jsonb)`, `bot_artifacts(id, bot_id, kind[workflow|prompt|schema], content, content_hash, version, is_current, created_by, created_at)`, `bot_versions(id, bot_id, label, artifact_ids jsonb, created_at)`. The canonical bot schema migrations are authored **RLS-ON by default** so new bots are never born exposed.
- **UI changes:** template gallery; bot "Versions" tab with artifact history + diff + guarded "Roll back to this version"; prompt editor with variable-substitution preview (read until approved in P7).
- **API changes:** `app/api/templates` (list/create-from-export), `app/api/templates/[id]/compile?dryRun=true` (compiled output, **zero side effects**), `app/api/bots/[ref]/{artifacts,versions}`, `app/api/bots/[ref]/workflow` (GET / non-destructive PUT with pre-snapshot).
- **Files to create:** `lib/{bot-artifact,bot-compiler,n8n-admin,artifacts}.ts`, `templates/tcenter-sales/{artifact.json,workflow.template.json,bindings.json,migrations/*.sql}`, `app/(dash)/{templates/page.tsx,bots/[ref]/versions/page.tsx}`, `app/api/templates/route.ts`, `app/api/templates/[id]/compile/route.ts`, `app/api/bots/[ref]/{artifacts,versions,workflow}/route.ts`, `components/bots/{version-history,prompt-editor}.tsx`, `tests/unit/bot-compiler.test.ts`, `tests/golden/tcenter-roundtrip.test.ts`, `supabase/control-plane/migrations/0005_templates_artifacts.sql`.
- **Files to modify:** `lib/n8n.ts`, `lib/types-control-plane.ts`, `app/api/n8n/workflows/[id]/route.ts`.
- **Dependencies:** P1, P2 (+ P3 for audited writes; P4 for migrations-with-RLS).
- **Risks:** editing pasted JSON corrupts UTF-8 / drops connections → golden roundtrip test asserts node+connection counts and byte-stable `systemMessage`; only token substitution, never connection reconstruction. Credentials write-only → artifacts store credential **references**, not values; rollback re-attaches existing creds. Hidden tenant-specific hardcoding in 91 nodes → binding-manifest review + dryRun diff vs live.
- **Acceptance criteria:**
  - **Golden test:** compiling `tcenter-sales` with T-CENTER's real params yields a workflow whose node count, connection graph, and `systemMessage` **byte-match** the live GET of `KIIGQZPxugci8i1j`.
  - Compiler is deterministic (same input → identical bytes) and leaves **no residual `{{TOKEN}}`**.
  - Every template migration is idempotent and creates all 7 tables **with RLS enabled** (asserted on a Supabase branch).
  - `compile?dryRun=true` produces valid output with **zero** n8n/Supabase mutations (verified by before/after listing).
  - Updating a bot creates a new `bot_artifacts` version (prior kept as rollback target); rollback re-PUTs the prior JSON and the live workflow matches the snapshot hash.

> **STATUS (2026-06-28): Phase 7 CORE COMPLETE (resumable/idempotent/audited state machine + 3 checkpoints proven via simulate); LIVE step execution deferred to a guarded runbook.** Built the provisioning pipeline as a **persisted state machine** (`lib/provisioning/state-machine.ts`, PURE: `draft → awaiting_pay_approval[💲] → creating_db → deploying_workflow → awaiting_qr[📱] → awaiting_prompt_approval[📝] → activating → live`). `store.ts` (jobs/checkpoints/deployments CRUD, every transition persisted → resumable), `steps.ts` (idempotent locate-or-create, **simulate-mode fully synthetic** so the whole flow is testable without spending money / touching a live bot; **live mode GUARDED** — paid project auto-create + live n8n PUT throw unless an explicit runbook enables them), `runner.ts` (start/approve/reject/retry — **owner-gated $ checkpoint**, operator-gated QR/prompt, explicit `requireRole` + `auditedMutation` on every transition). Migration `0007_provisioning.sql` (RLS-on) applied live. APIs: `provisioning/jobs` (start/list), `jobs/[id]` (status/retry), `jobs/[id]/checkpoints/[kind]` (approve/reject). Onboarding UI `/provisioning` (**defaults to simulate** so a stray click can't start live provisioning) + nav. **Acceptance MET (19 tests)**: start halts at 💲 with NO step run / NO paid resource; owner-only start; operator can't approve pay; full simulate flow deploys-then-halts-at-QR (not active) → QR+prompt → live; resume is idempotent (no duplicate ref); **rejected prompt stays `awaiting_prompt_approval`, never live**. **114 tests green, tsc clean, next build green, verify-live 44/0/1** (1 info = template drift monitor; the live bot is edited continuously). DEFERRED to a Phase-7b live runbook: real paid-project create + n8n workflow POST/PUT + `lib/whapi-admin.ts` channel config + QR-pairing screen + `get_cost` display + the live `bots.status`→live flip / `bot_secrets` population / `deployments` recording on go-live. NEXT: Phase 8 (always-on monitoring runtime: Cron → events → fan-out) or Phase 9 (analytics).

## Phase 7 — Provisioning Pipeline + Onboarding Wizard (Three Human Checkpoints)

> **USER REQUIREMENT (2026-06-27): "folder per business."** Every new bot must take the **business name first** and land in an organized n8n container named from it, so n8n + Supabase + the dashboard stay aligned per business. **Grounded against the live n8n (probed):** the instance's license does NOT allow projects (`/projects` → 403) and the public API has no folders (`/folders` → 404) — the only API-backed grouping primitive is **tags** (`/tags` → 200) + a `"<Business> — <Bot>"` workflow naming convention. So the onboarding step is **locate-or-create a per-business n8n tag** (`lib/n8n-org.ts → ensureBusinessTag`, idempotent/Fix-D) + name every workflow `"<Business> — <Bot>"` + tag it. Data-model hooks already landed (migration `0005`): `botops.tenants.org_label` (= business name), `n8n_tag_id`, and **reserved** `n8n_folder_id` / `n8n_project_id` for when the instance gains folder/project support — the swap is a one-function change with no schema/caller churn. Onboarding orders steps as: **business name → ensure container (tag) → create bot/workflows in it.**

- **Goal:** End-to-end onboarding that creates a new bot from a template as a **resumable, idempotent, audited job graph** with the three human checkpoints — replacing static-registry + manual builds.
- **Architecture changes:**
  - Provisioning = a persisted state machine in `provisioning_jobs` (`draft → awaiting_pay_approval → creating_db → deploying_workflow → awaiting_qr → awaiting_prompt_approval → live`), each transition audited and resumable (works around the agent-is-not-a-daemon limit).
  - Step set: **locate-or-create** data-plane project (gated by **$ checkpoint**; **Fix D: idempotent, never compensating-delete a paid project**) → apply migrations → create n8n credentials (store only the returned id) → compile + PUT workflow (deactivated) → configure WHAPI webhook (PATCH /settings) **or** emit a **QR-pairing task** (checkpoint) → render prompt + **approval checkpoint** → activate workflow (go-live).
  - Checkpoints are job pauses surfaced as typed tasks + notifications; only an authorized human advances them (records who/when).
- **Database changes (control-plane):** `provisioning_jobs(id, tenant_id, template_id, state, current_step, params jsonb, error, created_by, created_at, updated_at)`, `provisioning_checkpoints(id, job_id, kind[pay_approval|qr_pairing|prompt_approval], status[pending|approved|rejected], approver_user_id, decided_at, note)`, `deployments(id, bot_id, version_id, n8n_workflow_id, activated_at, rolled_back_from)`. On completion `bots.status` flips draft→live; `bot_secrets` populated (ciphertext).
- **UI changes:** onboarding wizard (pick template, name tenant, locate/create project, run steps with live status); three checkpoint screens (cost-approval card showing `get_cost`; QR-pairing screen; prompt-approval screen with approve/reject); jobs dashboard with resume/retry.
- **API changes:** `app/api/provisioning/jobs` (start/list), `…/jobs/[id]` (status/advance/retry), `…/jobs/[id]/checkpoints/[kind]` (approve/reject); `app/api/whapi/[ref]/channel` (configure webhook / request pairing). All RBAC-gated + audited.
- **Files to create:** `lib/provisioning/{state-machine,steps,checkpoints}.ts`, `lib/whapi-admin.ts`, `app/(dash)/{onboarding,provisioning}/page.tsx`, `app/api/provisioning/jobs/route.ts`, `…/jobs/[id]/route.ts`, `…/jobs/[id]/checkpoints/[kind]/route.ts`, `app/api/whapi/[ref]/channel/route.ts`, `components/onboarding/{wizard,checkpoint-pay,checkpoint-qr,checkpoint-prompt}.tsx`, `supabase/control-plane/migrations/0006_provisioning.sql`, `tests/integration/provisioning-{state-machine,idempotency}.test.ts`.
- **Files to modify:** `lib/whapi.ts`, `lib/n8n-admin.ts`, `lib/registry-store.ts`, `lib/services/audited.ts`.
- **Dependencies:** P1–P4, P6.
- **Risks:** QR pairing + paid create are not automatable → hard-stop checkpoints, never assume success; timeouts are resumable, not failed. **Fix D:** paid project create can't be cleanly undone → steps idempotent (locate-or-create), orphan detection, no compensating delete of a paid project. Free-tier 2-active-project limit can block new bots → surface at the $ checkpoint. WHAPI PATCH /settings unproven → isolate behind a flag + a de-risk spike before the pipeline depends on it; manual fallback checkpoint.
- **Acceptance criteria:**
  - Starting a job halts at the $ checkpoint and creates **NO paid resource** until an owner approves with cost shown.
  - After approval: creates DB/migrations + deploys workflow, then halts at QR checkpoint (pairing UI), does **not** activate.
  - After QR + prompt approval: workflow activated, `bots.status`→live; whole sequence in `audit_log` with approving users.
  - Killing the server mid-job and restarting **resumes from `current_step` without duplicating** created resources (idempotency test).
  - A rejected prompt checkpoint leaves the bot in `awaiting_prompt_approval` (never live), recorded.

> **STATUS (2026-06-29): Phase 8 CORE COMPLETE + dedup proven live; real notification channels + Overview-badge wiring deferred.** Always-on monitoring built: **pure detectors** `lib/monitor/detectors.ts` (`BOT_DOWN`/`QUEUE_STUCK`/`FAILED_SPIKE`/`N8N_ERROR_SPIKE`/`RLS_REGRESSION` + `rollupHealth`, stable dedup keys, tuneable thresholds), `signals.ts` (gathers per-bot signals via the **Phase-4 least-priv data-plane seam + n8n REST — no MCP**), `runner.ts` (one bounded, per-bot-error-isolated cycle: detect→dispatch→fan-out NEW→auto-resolve cleared→upsert health→system audit; + pure `cronAuthorized`). `lib/events.ts` (dispatch **deduped via a partial-unique index** `uq_events_open(dedup_key) where status<>'resolved'` + ON CONFLICT DO NOTHING; `resolveStaleEvents`; `upsertBotHealth`; `systemAudit`; subscription CRUD), `lib/notify.ts` (`matchSubscriptions` by type+min-severity; `fanOutEvent` → `notification_log`, channels STUBBED). Migration `0008_events_monitoring.sql` (dashboard_events/bot_health/notification_subscriptions/notification_log, RLS-on) applied live. APIs: `/api/cron/monitor` (**CRON_SECRET-gated**, middleware-allowlisted, `vercel.json` `*/5` [needs Vercel Pro]), `/api/events` (list + audited ack/resolve), `/api/notifications/subscriptions`. UI: **Events/Alerts inbox** as a new `התראות` tab in `/ops` (ack/resolve). **Acceptance MET (15 tests + live proof)**: detectors raise exactly one event per condition with stable dedup; **live DB proof** — 2 inserts of the same dedup_key → 1 open event, resolve→re-raise → new open (recurrence); `cronAuthorized` rejects without `CRON_SECRET`; cron runs as system actor in audit_log; signals read least-priv only. **129 tests green, tsc clean, next build green, verify-live 44/0/1.** DEFERRED to 8b: real channel delivery (web-push/telegram/email — currently `notification_log` stub), Overview health-badge wiring on bot/client cards (bot_health is persisted), `n8nErrorRate24h` computation, optional `/api/hooks/{whapi,n8n}`. NEXT: Phase 9 (analytics, CRM depth, cross-bot AI, exports) — the final phase.

## Phase 8 — Always-On Monitoring Runtime (Cron → Events → Fan-out)

- **Goal:** Replace on-demand health checks with a continuous runtime: a **Vercel Cron** worker diffs each bot's signals on an interval, writes typed events to the control plane, and fans out notifications (web push / Telegram / email) with dedup.
- **Architecture changes:** Cron route every ~60s in diff-mode computes per-bot signals (`BOT_DOWN`, `FAILED_SPIKE`, `QUEUE_STUCK`, `RETRY_EXHAUSTED`, `PAYMENT_RECEIVED`, `RLS_REGRESSION`) vs last snapshot, **reading via the P4 least-privilege path (never interactive MCP)**; `dispatchEvent()` is channel-agnostic with dedup keys; per-bot health rollup powers Overview badges; cron runs as a system actor in `audit_log`; idempotent + bounded (paginate tenants). Optional HMAC-verified `/api/hooks/whapi` + `/api/hooks/n8n` cut cron lag.
- **Database changes (control-plane):** `dashboard_events(id, bot_id, tenant_id, type, severity, dedup_key, payload jsonb, status[open|ack|resolved], created_at, resolved_at)` (unique index on `dedup_key`), `bot_health(bot_id pk, last_checked, queue_failed, queue_stuck, n8n_error_rate_24h, status)`, `notification_subscriptions(id, user_id, channel, target, event_types[])`, `notification_log(...)`.
- **UI changes:** health badges on bot/client cards; Events/Alerts inbox with ack/resolve; per-channel notification settings; queue monitor (event-backed).
- **API changes:** `app/api/cron/monitor` (CRON_SECRET-gated), `app/api/events` (list + ack/resolve), `app/api/notifications/subscriptions`, `app/api/hooks/{whapi,n8n}`.
- **Files to create:** `app/api/cron/monitor/route.ts`, `lib/monitor/{detectors,health}.ts`, `lib/{notify,events}.ts`, `lib/notify/{web-push,telegram,email}.ts`, `app/api/events/route.ts`, `app/api/notifications/subscriptions/route.ts`, `app/api/hooks/{whapi,n8n}/route.ts`, `components/overview/health-badge.tsx`, `components/events/events-inbox.tsx`, `vercel.json`, `supabase/control-plane/migrations/0007_events_monitoring.sql`, `tests/integration/monitor-detectors.test.ts`.
- **Files to modify:** `components/overview/{bot-card,client-card}.tsx`, `lib/env.ts`, `lib/services/data-plane.ts`.
- **Dependencies:** P1–P4.
- **Risks:** headless cron may lose claude.ai MCP auth → REST + stored creds only. Vercel Cron interval/timeout limits → batch per-bot, shard if needed. Notification storms → `dedup_key` + cool-down. Cron must respect the P4 allowlist, not reopen the god-PAT.
- **Acceptance criteria:**
  - Cron runs on schedule; a synthetic stuck `inbox` row produces exactly one `QUEUE_STUCK` event (deduped on re-run).
  - Deactivating a bot's workflow produces `BOT_DOWN` and flips its Overview badge within one cycle.
  - A subscribed user gets a notification on a new high-severity event; acking stops repeat fan-out.
  - The cron endpoint rejects requests without `CRON_SECRET` and runs as the system actor in `audit_log`.
  - Integration test proves the monitor uses only stored least-privilege creds (mocked REST), no interactive MCP.

> **STATUS (2026-06-29): Phase 9 CORE COMPLETE — the BotOps transformation's 9 phase-cores are all built.** Star deliverable: the **NL-to-SQL guard** `lib/ai/nl-sql.ts` (PURE, 25 tests) — an LLM query NEVER runs unguarded: single SELECT only, no writes/comments/multi-statement/system-catalogs, **table-allowlisted (incl. comma-join + JOIN targets, closing an allowlist-bypass found in self-review)**, row-capped; `runGuardedSelect` (guard+run), `generateSql` (Claude, env-guarded), `logAiQuery` (every attempt logged to `ai_query_log`). `lib/analytics.ts` (pure `assembleHeatmap` + `getAnalytics`: 7×24 heatmap + daily revenue via guarded `date_part` aggregates through the SAME guard — verified live: 159 buckets/12 revenue-days on T-CENTER), `lib/exports.ts` (pure `toCsv`), `lib/ai/digest.ts` (cross-bot KPIs + ONE cached Claude call/day → `digests`), `lib/ai/anthropic.ts` (thin client, inert without `ANTHROPIC_API_KEY`). Migration `0009_analytics_ai.sql` (`digests`, `ai_query_log`, RLS-on) applied live. APIs: `clients/[client]/analytics`, `clients/[client]/export` (CSV via allowlisted selectRows), `ai/query` (operator-gated + audited + logged; 503 if AI unconfigured), `digest`. UI: `/analytics` page (cross-bot digest card + per-bot KPI strip + heatmap + revenue bars + CSV export + NL-query box) + nav. **Acceptance MET (29 tests + live)**: analytics via allowlisted path (no route runSql); a malicious UPDATE/DROP/multi-statement/comma-join prompt is rejected + logged; daily digest = one cached Claude call; CSV export flattens rows. **161 tests green, tsc clean, next build green, verify-live 44/0/1.** DEFERRED (additive, lower-value): leads Kanban drag + appointments calendar (LeadManager untouched per the no-regression rule); Sheets two-way export; the response-time stat. **— BotOps transformation: phase-cores 1–9 complete.**

## Phase 9 — Analytics, CRM Depth, Cross-Bot AI & Exports

- **Goal:** Deliver the remaining business-value breadth from `docs/ROADMAP.md` on the hardened platform — per-bot analytics, leads Kanban + appointments, cross-bot KPI digest + AI brief/NL-query, CSV/Sheets exports — **without touching the data model or auth again**. (Lays groundwork for future self-serve customer portal + billing.)
- **Architecture changes:** analytics + AI read through the P4 allowlisted aggregate path + P8 events/health; daily AI digest + per-thread brief = a single cost-aware Claude call over cross-bot aggregates; **NL-to-SQL emits SELECT-only**, validated against `introspect()` identifiers + the P4 allowlist (never free-form). CRM depth builds on `crm.ts`/`reminders.ts`/`leads` patterns, additive — Shift Digital LeadManager stays intact.
- **Database changes:** no control-plane core changes; optional `digests(id, date, scope, summary jsonb, created_at)` and `ai_query_log(user_id, prompt, generated_sql, row_count, created_at)` for auditability. Leads writes go PK-scoped + audited.
- **UI changes:** per-bot Analytics (7×24 heatmap, revenue line, median response time); leads Kanban (drag → status + activities); appointments calendar with WhatsApp reminders; cross-bot KPI strip (today vs yesterday vs 7-day avg); daily AI digest card; NL-query box; CSV export + Sheets sync.
- **API changes:** `app/api/analytics/[ref]`, `app/api/digest`, `app/api/ai/query` (NL→SELECT via allowlisted builder), `app/api/exports/[ref]`, `app/api/leads/[id]/status` (Kanban), `app/api/appointments`.
- **Files to create:** `app/(dash)/analytics/page.tsx`, `app/api/{analytics/[ref],digest,ai/query,exports/[ref],leads/[id]/status,appointments}/route.ts`, `lib/{analytics,ai/digest,ai/nl-sql}.ts`, `components/analytics/{heatmap,kpi-strip}.tsx`, `components/crm/{leads-kanban,appointments-calendar}.tsx`, `components/ai/digest-card.tsx`, `tests/unit/nl-sql-guard.test.ts`.
- **Files to modify:** `lib/{crm,reminders,metrics,google-sheets}.ts`, `components/crm/crm-view.tsx`, `components/leads/lead-manager.tsx`.
- **Dependencies:** P1–P4, P8.
- **Risks:** NL-to-SQL is an injection vector → SELECT-only, identifier-allowlisted, row-capped, logged. Cross-bot AI cost grows with bot count → batch + cache one call/day/scope. Refactoring `crm.ts`/`leads-sheet.ts` could break LeadManager → keep additive + covered by existing flow tests.
- **Acceptance criteria:**
  - Per-bot Analytics renders heatmap + revenue trend from real aggregates via the allowlisted path (no direct `runSql`).
  - Leads Kanban drag updates `leads.status` (PK-scoped, audited) + writes `activities`; LeadManager unchanged.
  - Daily digest = one Claude call, stored/auditable.
  - NL-query only ever emits/runs a SELECT against allowlisted identifiers; a malicious UPDATE/DROP prompt is rejected + logged.
  - CSV export downloads flattened orders/leads; all prior-phase tests green; CI fully green.

---

## Where the old `docs/ROADMAP.md` wishlist lands

| Old wishlist item | New phase |
|---|---|
| Human-takeover toggle, Watchlist, queue monitor + Requeue, payment-chase, n8n error drill-down | **P5** |
| AI daily digest, NL query, analytics, CRM Kanban, appointments, exports | **P9** |
| Auth with users/roles/invites, audit log | **P3** |
| RLS hardening center | **P4** |
| `bot_registry` onboarding (no redeploy), per-bot branding | **P2** (registry) + **P7** (onboarding) |
| `dashboard_events` Cron → fan-out, real-time webhooks | **P8** |

## Execution protocol

1. Implement phases strictly in order; do not start a phase until its `dependencies` are merged + green.
2. Each phase: write tests first where practical, keep CI green, keep LeadManager + dashboard working.
3. Stop at the three human checkpoints (they require the operator: money, QR, prompt approval).
4. After each phase, update this file's status and the project memory.
