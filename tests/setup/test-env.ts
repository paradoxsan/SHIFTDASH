// Minimal env so modules that read process.env at call time (lib/env.ts) work
// under test. These are throwaway values — never real secrets.
process.env.AUTH_SECRET ||= "test-secret-not-for-prod";
process.env.DASHBOARD_PASSWORD ||= "test-password";
process.env.SUPABASE_MANAGEMENT_TOKEN ||= "test-pat";
process.env.N8N_BASE_URL ||= "https://n8n.test";
process.env.N8N_API_KEY ||= "test-n8n-key";
process.env.AGENCY_SHEET_ID ||= "test-sheet";
process.env.GOOGLE_OAUTH_CLIENT_ID ||= "test-client-id";
process.env.GOOGLE_OAUTH_CLIENT_SECRET ||= "test-client-secret";
// base64 of 32 zero bytes — throwaway KEK so env.secretsKek() resolves in tests.
process.env.SECRETS_KEK ||= "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
process.env.CRON_SECRET ||= "test-cron-secret";
process.env.ANTHROPIC_API_KEY ||= "test-anthropic-key";
