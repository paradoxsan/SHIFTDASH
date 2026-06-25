// Google OAuth (OpenID Connect) login, restricted to an allowlist of emails.
// The id_token comes directly from Google's token endpoint over TLS, so we can
// trust its payload without re-verifying the signature (per Google's docs).
import { env } from "./env";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Derive the app's public origin from the incoming request (or AUTH_BASE_URL). */
export function originFromRequest(req: Request): string {
  const base = process.env.AUTH_BASE_URL;
  if (base) return base.replace(/\/+$/, "");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

export function redirectUriFor(origin: string): string {
  return `${origin}/api/auth/google/callback`;
}

export function buildAuthUrl(redirectUri: string, state: string): string {
  const u = new URL(AUTH_ENDPOINT);
  u.searchParams.set("client_id", env.googleOAuthClientId());
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("access_type", "online");
  u.searchParams.set("prompt", "select_account");
  u.searchParams.set("state", state);
  return u.toString();
}

export async function exchangeCodeForEmail(
  code: string,
  redirectUri: string
): Promise<{ email: string; verified: boolean }> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.googleOAuthClientId(),
      client_secret: env.googleOAuthClientSecret(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google token ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error("No id_token returned by Google");
  const payloadPart = data.id_token.split(".")[1];
  const payload = JSON.parse(Buffer.from(payloadPart, "base64").toString("utf8")) as {
    email?: string;
    email_verified?: boolean;
  };
  if (!payload.email) throw new Error("No email in Google token");
  return { email: payload.email.toLowerCase(), verified: Boolean(payload.email_verified) };
}

export function isAllowed(email: string): boolean {
  const allow = env.allowedEmails();
  return allow.length > 0 && allow.includes(email.toLowerCase());
}
