// Server-only environment access. These values are never bundled to the client
// because they are not prefixed with NEXT_PUBLIC_. Only import this from route
// handlers / server components / middleware.

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v.trim();
}

export const env = {
  supabaseManagementToken: () => required("SUPABASE_MANAGEMENT_TOKEN"),

  supabaseApiBase: () =>
    (process.env.SUPABASE_API_BASE ?? "https://api.supabase.com").replace(/\/+$/, ""),

  projectAllowlist: (): string[] =>
    (process.env.SUPABASE_PROJECT_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),

  // BotOps control-plane: project ref hosting the `botops` schema (Phase 2,
  // Option B). Defaults to the project that already holds it; change to migrate.
  controlPlaneRef: () => process.env.CONTROL_PLANE_REF?.trim() || "kracmhwzmgligxngmhmi",

  // BotOps Phase 4: key-encryption-key for bot_secrets (base64 of 32 bytes).
  // Generate with `openssl rand -base64 32`. Required only when reading/writing
  // encrypted per-bot credentials, so it is lazily required at call time.
  secretsKek: () => required("SECRETS_KEK"),

  n8nBaseUrl: () => required("N8N_BASE_URL").replace(/\/+$/, ""),
  n8nApiKey: () => required("N8N_API_KEY"),

  whapiBaseUrl: () =>
    (process.env.WHAPI_BASE_URL ?? "https://gate.whapi.cloud").replace(/\/+$/, ""),

  whapiTokens: (): Record<string, string> => {
    try {
      const parsed = JSON.parse(process.env.WHAPI_TOKENS_JSON ?? "{}");
      return typeof parsed === "object" && parsed ? parsed : {};
    } catch {
      return {};
    }
  },

  dashboardPassword: () => required("DASHBOARD_PASSWORD"),
  authSecret: () => required("AUTH_SECRET"),

  // Internal Copilot API: shared bearer secret used by the WhatsApp Copilot bot
  // (n8n) to read the read-only /api/internal/* endpoints. Not the session cookie.
  copilotSecret: () => required("COPILOT_SECRET"),

  // Monitoring cron (Phase 8): shared secret Vercel Cron sends as a bearer token
  // so the public /api/cron/monitor endpoint can't be triggered by anyone else.
  cronSecret: () => required("CRON_SECRET"),

  agencySheetId: () => required("AGENCY_SHEET_ID"),

  // Cross-bot AI (Phase 9): optional. NL-query + daily digest call Claude only
  // when configured; otherwise those endpoints return "AI not configured".
  //
  // Two credential shapes are accepted, because they are billed differently:
  //   ANTHROPIC_API_KEY   — a console.anthropic.com key, sent as x-api-key and
  //                         billed per token to the API account.
  //   ANTHROPIC_AUTH_TOKEN— any bearer credential (an OAuth token from a Claude
  //                         subscription, or a gateway/proxy token). Sent as
  //                         Authorization: Bearer.
  // The bearer wins when both are present, so dropping a token in overrides the
  // key without editing code.
  anthropicKey: () => process.env.ANTHROPIC_API_KEY?.trim() || "",
  anthropicAuthToken: () => process.env.ANTHROPIC_AUTH_TOKEN?.trim() || "",
  aiConfigured: () =>
    Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim()),

  /** The model the copilot and the digest run on. */
  aiModel: () => process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5",
  /** How hard the model may think before answering: low | medium | high | xhigh. */
  aiEffort: () => (process.env.ANTHROPIC_EFFORT?.trim() || "xhigh").toLowerCase(),

  // ── Morning / Green Invoice (Phase 3: the כסף screen) ──────────────────────
  // Morning issues a PAIR: an API key id AND a secret. Both are required to mint
  // the JWT — an id on its own authenticates nothing. Optional at boot so the
  // rest of the dashboard runs without them; the money screen says "not
  // connected" instead of 500-ing, and starts working the moment both are set.
  morningId: () => process.env.MORNING_API_KEY_ID?.trim() || "",
  morningSecret: () => process.env.MORNING_API_SECRET?.trim() || "",
  morningConfigured: () =>
    Boolean(process.env.MORNING_API_KEY_ID?.trim() && process.env.MORNING_API_SECRET?.trim()),
  // Point at Morning's sandbox while testing so no real document is ever issued.
  morningBaseUrl: () =>
    (process.env.MORNING_API_BASE ?? "https://api.greeninvoice.co.il/api/v1").replace(/\/+$/, ""),

  // ── Google OAuth login (allowlisted emails) ────────────────────────────────
  googleOAuthClientId: () => required("GOOGLE_OAUTH_CLIENT_ID"),
  googleOAuthClientSecret: () => required("GOOGLE_OAUTH_CLIENT_SECRET"),
  googleConfigured: () =>
    Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET),
  allowedEmails: () =>
    (process.env.AUTH_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
};
