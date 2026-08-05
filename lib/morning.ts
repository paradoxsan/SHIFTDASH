// Morning (Green Invoice) API client — the accounting side of the money screen.
//   • read only. This never issues, cancels or edits a document; the dashboard
//     reports on the books, it does not write to them.
//
// Auth is a two-step: POST the {id, secret} pair to /account/token to mint a
// short-lived JWT, then bearer it on every call. The JWT is cached in module
// scope until shortly before it expires, so a page that fans out to documents +
// expenses + clients costs one login, not three.
//
// All parsing lives in lib/billing.ts (pure, unit-tested); this file only fetches.
import { env } from "./env";
import {
  normalizeAll,
  normalizeDocument,
  normalizeExpense,
  INCOME_TYPES,
  DOC_TYPE,
  type MorningDoc,
  type MorningExpense,
} from "./billing";

export class MorningNotConfiguredError extends Error {
  constructor() {
    super("Morning is not connected — set MORNING_API_KEY_ID and MORNING_API_SECRET");
    this.name = "MorningNotConfiguredError";
  }
}

export function morningConfigured(): boolean {
  return env.morningConfigured();
}

// ── Token cache ───────────────────────────────────────────────────────────────

interface CachedToken {
  token: string;
  /** Epoch ms after which we re-mint. */
  expiresAt: number;
}
let cached: CachedToken | null = null;

/** Re-mint this long before the real expiry so a request never races the clock. */
const EXPIRY_MARGIN_MS = 60_000;
const DEFAULT_TTL_MS = 55 * 60_000; // Morning tokens last ~1h.

/** Drop the cached JWT. Exported for tests and for a credentials change. */
export function resetMorningToken(): void {
  cached = null;
}

async function token(): Promise<string> {
  if (!env.morningConfigured()) throw new MorningNotConfiguredError();
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  const res = await fetch(`${env.morningBaseUrl()}/account/token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ id: env.morningId(), secret: env.morningSecret() }),
    cache: "no-store",
  });
  if (!res.ok) {
    // Do not echo the body verbatim — it can contain the submitted id.
    throw new Error(`Morning auth failed (${res.status}). Check the API key id and secret.`);
  }
  const data = (await res.json()) as { token?: string; expires?: number };
  if (!data.token) throw new Error("Morning auth returned no token");

  // `expires` is a unix timestamp in seconds when present.
  const expiresAt =
    typeof data.expires === "number" && data.expires > 0
      ? data.expires * 1000 - EXPIRY_MARGIN_MS
      : Date.now() + DEFAULT_TTL_MS;
  cached = { token: data.token, expiresAt };
  return data.token;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const jwt = await token();
  const res = await fetch(`${env.morningBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (res.status === 401) {
    // The cached JWT went stale early — drop it so the next call re-authenticates.
    resetMorningToken();
    throw new Error("Morning rejected the token (401). Retry, or re-check the credentials.");
  }
  if (!res.ok) throw new Error(`Morning ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

interface SearchPage {
  items?: unknown[];
  total?: number;
}

const PAGE_SIZE = 100;
/** Hard ceiling so a wide date range can never turn into an unbounded crawl. */
const MAX_PAGES = 20;

/** Page through a Morning /search endpoint until it runs out or hits the cap. */
async function searchAll(path: string, query: Record<string, unknown>): Promise<{
  rows: unknown[];
  truncated: boolean;
}> {
  const rows: unknown[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await post<SearchPage>(path, { ...query, page, pageSize: PAGE_SIZE });
    const items = Array.isArray(data.items) ? data.items : [];
    rows.push(...items);
    if (items.length < PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

// ── Documents ─────────────────────────────────────────────────────────────────

export interface DocumentsResult {
  docs: MorningDoc[];
  /** Rows the parser could not make sense of — surfaced, not swallowed. */
  skipped: number;
  truncated: boolean;
}

/** Income documents issued in `[fromDate, toDate]` (both `YYYY-MM-DD`). */
export async function listDocuments(fromDate: string, toDate: string): Promise<DocumentsResult> {
  const { rows, truncated } = await searchAll("/documents/search", {
    fromDate,
    toDate,
    // Proformas are requested too: an unpaid חשבונית עסקה is money a client owes
    // me, which is exactly what the overdue badge is about.
    type: [...INCOME_TYPES, DOC_TYPE.PROFORMA],
  });
  const { items, skipped } = normalizeAll(rows, normalizeDocument);
  return { docs: items, skipped, truncated };
}

export interface ExpensesResult {
  expenses: MorningExpense[];
  skipped: number;
  truncated: boolean;
}

export async function listExpenses(fromDate: string, toDate: string): Promise<ExpensesResult> {
  const { rows, truncated } = await searchAll("/expenses/search", { fromDate, toDate });
  const { items, skipped } = normalizeAll(rows, normalizeExpense);
  return { expenses: items, skipped, truncated };
}

// ── Clients (for linking a dashboard client to its Morning customer) ──────────

export interface MorningClient {
  id: string;
  name: string;
}

export async function listMorningClients(): Promise<MorningClient[]> {
  const { rows } = await searchAll("/clients/search", { active: true });
  return rows
    .map((r): MorningClient | null => {
      if (typeof r !== "object" || r === null) return null;
      const o = r as Record<string, unknown>;
      const id = o.id;
      const name = o.name;
      if (id === undefined || id === null) return null;
      return { id: String(id), name: String(name ?? "").trim() || String(id) };
    })
    .filter((c): c is MorningClient => c !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
}

/** Cheap liveness probe for the monitor and the "connected?" banner. */
export async function morningPing(): Promise<{ ok: boolean; detail?: string }> {
  if (!env.morningConfigured()) return { ok: false, detail: "not configured" };
  try {
    await token();
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
