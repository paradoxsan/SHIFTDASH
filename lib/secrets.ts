// ── Secret encryption-at-rest (BotOps Phase 4) ────────────────────────────────
// Per-tenant data-plane credentials (e.g. a project's service_role key) are
// stored in the control-plane `botops.bot_secrets` table as AES-256-GCM
// ciphertext, NEVER plaintext and NEVER returned to the client. The key-
// encryption-key (KEK) lives only in a server env var (SECRETS_KEK), so a DB
// dump alone cannot decrypt anything. This retires the god-PAT for data
// MUTATIONS over time: a bot with a stored least-privilege key uses it instead.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "./env";
import { controlPlaneRef } from "./control-plane";
import { runSql } from "./supabase-management";
import { sqlString } from "./sql";

const ALGO = "aes-256-gcm";

export interface Ciphertext {
  ciphertext: string; // base64 (encrypted bytes + 16-byte GCM auth tag appended)
  nonce: string; // base64 12-byte IV
}

/** Pure: encrypt with an explicit 32-byte key. Used directly by tests. */
export function encryptWithKey(plaintext: string, key: Buffer): Ciphertext {
  if (key.length !== 32) throw new Error("KEK must be 32 bytes");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([enc, tag]).toString("base64"),
    nonce: iv.toString("base64"),
  };
}

/** Pure: decrypt with an explicit 32-byte key. Throws if the tag fails. */
export function decryptWithKey(payload: Ciphertext, key: Buffer): string {
  if (key.length !== 32) throw new Error("KEK must be 32 bytes");
  const raw = Buffer.from(payload.ciphertext, "base64");
  const tag = raw.subarray(raw.length - 16);
  const enc = raw.subarray(0, raw.length - 16);
  const decipher = createDecipheriv(ALGO, key, Buffer.from(payload.nonce, "base64"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** Decode the server KEK (base64 of 32 bytes) from env. */
function kek(): Buffer {
  const raw = env.secretsKek();
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("SECRETS_KEK must be base64 of exactly 32 bytes (use: openssl rand -base64 32)");
  }
  return key;
}

export function encryptSecret(plaintext: string): Ciphertext {
  return encryptWithKey(plaintext, kek());
}
export function decryptSecret(payload: Ciphertext): string {
  return decryptWithKey(payload, kek());
}

// ── Control-plane storage (ciphertext only) ───────────────────────────────────
export type SecretKind = "service_role" | "db_url" | "anon" | "other";

/** Upsert an encrypted secret for a bot. Stores ONLY ciphertext + nonce. */
export async function putBotSecret(botId: string, kind: SecretKind, plaintext: string): Promise<void> {
  const { ciphertext, nonce } = encryptSecret(plaintext);
  await runSql(
    controlPlaneRef(),
    `insert into botops.bot_secrets (bot_id, kind, ciphertext, nonce)
       values (${sqlString(botId)}::uuid, ${sqlString(kind)}, ${sqlString(ciphertext)}, ${sqlString(nonce)})
     on conflict (bot_id, kind) do update
       set ciphertext = excluded.ciphertext,
           nonce      = excluded.nonce,
           rotated_at = now()`
  );
}

/** Fetch + decrypt a bot secret (server-only). Returns null if absent. */
export async function getBotSecret(botId: string, kind: SecretKind): Promise<string | null> {
  const rows = await runSql<{ ciphertext: string; nonce: string }>(
    controlPlaneRef(),
    `select ciphertext, nonce from botops.bot_secrets
      where bot_id = ${sqlString(botId)}::uuid and kind = ${sqlString(kind)} limit 1`
  );
  const row = rows[0];
  return row ? decryptSecret(row) : null;
}

/** Presence/metadata only — never returns plaintext or ciphertext. */
export async function listBotSecretKinds(
  botId: string
): Promise<{ kind: string; created_at: string; rotated_at: string | null }[]> {
  return runSql<{ kind: string; created_at: string; rotated_at: string | null }>(
    controlPlaneRef(),
    `select kind, created_at, rotated_at from botops.bot_secrets
      where bot_id = ${sqlString(botId)}::uuid order by kind`
  );
}
