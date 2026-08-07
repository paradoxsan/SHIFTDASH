// Signed, unguessable links for the client-facing monthly report.
//
// The internal report sits behind the normal session gate. The per-client
// version has to be forwardable to someone who will never log in, so it is
// addressed by an HMAC token instead: the payload is public (month + client id),
// the signature is what makes the URL unguessable and non-enumerable.
//
// This grants read access to ONE client's report for ONE month — nothing else.
import { createHmac, timingSafeEqual } from "node:crypto";

const b64url = (b: Buffer): string =>
  b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function secret(): string {
  const s = process.env.AUTH_SECRET?.trim();
  if (!s) throw new Error("AUTH_SECRET not configured — cannot sign report links");
  return s;
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", secret()).update(`report:${payload}`).digest()).slice(0, 27);
}

export interface ReportRef {
  month: string;
  clientId: string;
}

/** "2026-07~t-center~<sig>" — safe in a URL path and in a WhatsApp message. */
export function signReportToken({ month, clientId }: ReportRef): string {
  const payload = `${month}~${clientId}`;
  return `${payload}~${sign(payload)}`;
}

/** Returns null for anything that does not verify. Never throws on bad input. */
export function verifyReportToken(token: string): ReportRef | null {
  try {
    const parts = String(token || "").split("~");
    if (parts.length !== 3) return null;
    const [month, clientId, sig] = parts;
    if (!/^\d{4}-\d{2}$/.test(month) || !/^[a-z0-9-]{1,40}$/i.test(clientId)) return null;
    const expected = sign(`${month}~${clientId}`);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return { month, clientId };
  } catch {
    return null;
  }
}
