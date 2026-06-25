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

  agencySheetId: () => required("AGENCY_SHEET_ID"),
};
