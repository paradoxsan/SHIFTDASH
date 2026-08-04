// Stateless signed-cookie auth (HMAC-SHA256). Works in both the Edge middleware
// and Node route handlers via the Web Crypto API.
//   • v1 token: `v1.{exp}.{sig}` — identity-less (legacy).
//   • v2 token: `v2.{exp}.{b64(email,role)}.{sig}` — identity-bearing (Phase 3).
import { env } from "./env";
import type { Role } from "./rbac";

export const SESSION_COOKIE = "bd_session";
export const SESSION_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

const encoder = new TextEncoder();

function base64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return base64url(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function createSessionToken(): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
  const payload = `v1.${exp}`;
  const sig = await hmac(env.authSecret(), payload);
  return `${payload}.${sig}`;
}

async function verifyV1(token: string): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [v, expStr, sig] = parts;
  if (v !== "v1") return false;
  const expected = await hmac(env.authSecret(), `${v}.${expStr}`);
  if (!timingSafeEqual(sig, expected)) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  return true;
}

// ── Identity-bearing v2 session (BotOps Phase 3) ──────────────────────────────
export interface Session {
  email: string;
  role: Role;
}

function b64urlEncode(s: string): string {
  const bytes = encoder.encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): string {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function asRole(r: unknown): Role {
  return r === "owner" || r === "operator" || r === "viewer" ? r : "viewer";
}

export async function createSessionTokenV2(session: Session): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
  const payload = b64urlEncode(JSON.stringify({ e: session.email, r: session.role }));
  const head = `v2.${exp}.${payload}`;
  const sig = await hmac(env.authSecret(), head);
  return `${head}.${sig}`;
}

async function verifyV2(token: string): Promise<Session | null> {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v2") return null;
  const [v, expStr, payload, sig] = parts;
  const expected = await hmac(env.authSecret(), `${v}.${expStr}.${payload}`);
  if (!timingSafeEqual(sig, expected)) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  try {
    const obj = JSON.parse(b64urlDecode(payload)) as { e?: string; r?: string };
    if (!obj.e) return null;
    return { email: obj.e, role: asRole(obj.r) };
  } catch {
    return null;
  }
}

/** Boolean gate used by middleware — accepts both legacy v1 and identity v2. */
export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  if (token.split(".")[0] === "v2") return (await verifyV2(token)) !== null;
  return verifyV1(token);
}

/** Resolve the session identity. A valid legacy v1 token is treated as a
 *  transitional owner so existing sessions keep working until they expire. */
export async function getSession(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  if (token.split(".")[0] === "v2") return verifyV2(token);
  if (await verifyV1(token)) return { email: "legacy@session", role: "owner" };
  return null;
}

export function checkPassword(input: string | undefined | null): boolean {
  if (!input) return false;
  try {
    return timingSafeEqual(input, env.dashboardPassword());
  } catch {
    return false;
  }
}
