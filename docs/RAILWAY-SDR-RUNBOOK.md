# SDR on Railway — runbook

A clean n8n instance on Railway hosting a byte-identical copy of the live Shift SDR.
Built 2026-08-04. The GCloud/Coolify instance is untouched and still serving production —
this is a parallel stand-up, not a cutover.

## What exists

| Thing | Value |
|---|---|
| Railway project | `shift-sdr` — `3a6c3c84-b7a9-46a1-b440-ef531d6af6ba` |
| Environment | `production` — `ad8f6c61-28bd-4992-bb43-82ab37b9737b` |
| n8n URL | `https://n8n-production-2b9c.up.railway.app` |
| Workflow | `SDR — Shift (Railway)` — `y9cY8wSComeosXi6`, 102 nodes, **inactive** |
| Services | `n8n` (docker.n8n.io/n8nio/n8n:latest) + `postgres` (postgres:16-alpine, 
volume at `/var/lib/postgresql/data`) |

**Where the secrets live.** `N8N_ENCRYPTION_KEY` and the Postgres password are stored as
Railway environment variables on the `n8n` service — Railway is the durable store, there is
nothing to copy elsewhere. The n8n owner login and API key were issued during setup; move them
to a password manager and delete the session scratchpad copy.

### Two design decisions worth knowing

**No volume on the n8n service.** Railway mounts volumes root-owned; the n8n image runs as
`node`, so `/home/node/.n8n` gave `EACCES` and the container crash-looped. Rather than fight
permissions, `N8N_USER_FOLDER=/tmp/.n8n` and *all* persistent state lives in Postgres. The
encryption key is pinned in env, so an ephemeral user folder loses nothing across restarts.

**Imported from `activeVersion`, not `nodes`.** The GCloud workflow's editor draft is 6 nodes
behind its published version — the entire voice-transcription branch exists only in what's
actually running. The export deliberately took the published 102-node version. Verified by
byte-matching node count, connection graph, node-name/type hashes, and the `systemMessage`.

## Before you activate

### 1. Fix the OAuth consent screen — this is the actual root cause

Moving to Railway **does not fix the credential expiry.** It fixes the *other* problem: the
GCloud host was an IP-encoded `sslip.io` domain, so every VM IP change broke the redirect URI.
Railway's domain is stable, so that class of breakage is gone for good.

But the 7-day refresh-token death is a Google setting, and it will happen here identically:

> GCP project `shiftdifitalcrm` → OAuth client `…-rumk9oc…` → **publish the consent screen to
> Production.** While it sits in *Testing*, Google revokes refresh tokens after 7 days.

Evidence this is the real cause: the creds were reconnected 2026-06-28, and the workflow's own
`staticData` records the Calendar trigger's last successful check as **2026-07-05** — exactly
seven days later. Reconnecting without publishing buys another seven days and nothing more.

### 2. Register the new redirect URI

Add to the same OAuth client's authorized redirect URIs:

```
https://n8n-production-2b9c.up.railway.app/rest/oauth2-credential/callback
```

Confirm it against what the n8n credential screen displays — copy that value verbatim rather
than typing it.

### 3. Create three credentials in the new n8n

OAuth consent needs a browser, so this part cannot be scripted.

| Type | Suggested name | Used by |
|---|---|---|
| `googleSheetsOAuth2Api` | `Google Sheets account 2` | 15 nodes — CRM, Context Engine, test/BID system |
| `googleCalendarOAuth2Api` | `Google Calendar account` | 6 nodes — booking + reminders |
| `googlePalmApi` | `Google Gemini(PaLM) Api account` | 4 nodes — agents + voice transcription |

Keeping the names identical lets the remap script match unambiguously.

### 4. Remap the 25 credential references

The imported nodes still point at the old instance's credential IDs. Instead of re-picking a
credential on 25 nodes by hand:

```bash
node scripts/railway/remap-credentials.mjs --dry-run   # inspect first
node scripts/railway/remap-credentials.mjs
```

### 5. Verify — do not assume

```bash
node scripts/railway/verify-sdr.mjs
```

Checks server health, node count, that the voice branch and Context Engine survived, that no
credential reference dangles, that draft and published versions have not diverged, and the
execution error rate. Exits non-zero on any failure.

## Cutover

Do this one webhook at a time, and leave GCloud running.

Green API currently points at the old host. The new endpoints are:

| Path | New URL |
|---|---|
| `green-api-incoming` | `https://n8n-production-2b9c.up.railway.app/webhook/green-api-incoming` |
| `shift-lead-intake` | `https://n8n-production-2b9c.up.railway.app/webhook/shift-lead-intake` |
| `sdr-bot-control` | `https://n8n-production-2b9c.up.railway.app/webhook/sdr-bot-control` |

1. Activate the workflow on Railway.
2. Send a test message **from a non-manager number.** Daniel (`972584257154`) and Noam
   (`972533212520`) route through `מי שלח? מנהל או ליד` to the admin path and never reach the
   lead agent — a manager test proves nothing about the lead flow or the voice branch.
3. Repoint the Green API webhook.
4. Deactivate the GCloud SDR (do **not** delete it).
5. Watch `verify-sdr.mjs` for a day.

**Rollback:** repoint the Green API webhook back and reactivate the GCloud workflow. Keep that
VM alive for at least a week.

## Known gaps

- **The GCloud SDR is still broken** — Calendar OAuth has been dead since 2026-07-05, roughly
  3,200 failed executions a day. Publishing the consent screen fixes both instances at once.
- **The GCloud draft/active divergence is still armed.** Anyone opening the old SDR in the n8n
  UI and pressing Save publishes the stale 96-node draft and deletes the voice branch from the
  running version. Worth defusing even though the new instance is unaffected.
- Only the SDR was migrated. T-CENTER and BRJewelry remain on GCloud.
- No GitHub-driven deploy yet. If you want the bot governed by the repo rather than snapshotted
  from it, that is the `templates/` + compiler path already proven on `tcenter-sales`.
