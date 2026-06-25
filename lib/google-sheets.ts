// Google Sheets API v4 client authenticated with a service account.
// The agency lead pipeline lives in a Google Sheet (the source of truth), so the
// LeadManager reads and writes it directly. Provide GOOGLE_SERVICE_ACCOUNT_JSON
// (the full service-account key JSON) and share the sheet with that account's
// email as Editor. No external dependency — RS256 JWT is signed via Web Crypto.

import { readFileSync } from "node:fs";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function serviceAccount(): ServiceAccount {
  let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw && process.env.GOOGLE_SERVICE_ACCOUNT_FILE) {
    raw = readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_FILE, "utf8");
  }
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_SERVICE_ACCOUNT_FILE not set");
  const j = JSON.parse(raw) as ServiceAccount;
  if (!j.client_email || !j.private_key) throw new Error("Invalid service account JSON");
  // Support keys pasted with literal \n escapes.
  return { client_email: j.client_email, private_key: j.private_key.replace(/\\n/g, "\n") };
}

export function sheetsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_FILE
  );
}

const enc = new TextEncoder();

function base64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

let tokenCache: { at: number; token: string } | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() - tokenCache.at < 50 * 60_000) return tokenCache.token;
  const { client_email, private_key } = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claim = base64url(
    enc.encode(
      JSON.stringify({
        iss: client_email,
        scope: "https://www.googleapis.com/auth/spreadsheets",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      })
    )
  );
  const signingInput = `${header}.${claim}`;
  const key = await importPrivateKey(private_key);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(signingInput));
  const jwt = `${signingInput}.${base64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent(
      "urn:ietf:params:oauth:grant-type:jwt-bearer"
    )}&assertion=${jwt}`,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google token ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  tokenCache = { at: Date.now(), token: data.access_token };
  return data.access_token;
}

const API = "https://sheets.googleapis.com/v4/spreadsheets";

/** Read a range, e.g. "Sheet1!A1:R500". Returns a 2D array of cell strings. */
export async function readSheet(spreadsheetId: string, range: string): Promise<string[][]> {
  const token = await getAccessToken();
  const res = await fetch(`${API}/${spreadsheetId}/values/${encodeURIComponent(range)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Sheets read ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { values?: string[][] };
  return data.values ?? [];
}

/** List tab/sheet titles in the spreadsheet. */
export async function listTabs(spreadsheetId: string): Promise<string[]> {
  const token = await getAccessToken();
  const res = await fetch(`${API}/${spreadsheetId}?fields=sheets.properties.title`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Sheets meta ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { sheets?: { properties: { title: string } }[] };
  return (data.sheets ?? []).map((s) => s.properties.title);
}

/** Overwrite a range (USER_ENTERED so dates/formulas parse). */
export async function updateRange(
  spreadsheetId: string,
  range: string,
  values: (string | number | null)[][]
): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(
    `${API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ values }),
      cache: "no-store",
    }
  );
  if (!res.ok) throw new Error(`Sheets update ${res.status}: ${await res.text()}`);
}

/** Append a row to the end of a sheet/tab. */
export async function appendRow(
  spreadsheetId: string,
  range: string,
  row: (string | number | null)[]
): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(
    `${API}/${spreadsheetId}/values/${encodeURIComponent(
      range
    )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ values: [row] }),
      cache: "no-store",
    }
  );
  if (!res.ok) throw new Error(`Sheets append ${res.status}: ${await res.text()}`);
}
