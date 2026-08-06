// ── Thin Claude client (BotOps Phase 9) ───────────────────────────────────────
// One cost-aware call. Used by the NL-query (generate a SELECT) and the daily
// digest (summarise cross-bot KPIs). Inert unless a credential is configured.
import { env } from "../env";

const API_URL = "https://api.anthropic.com/v1/messages";

/**
 * Auth for the Messages API. An API key goes in `x-api-key`; any other bearer
 * credential goes in `Authorization`. A Claude subscription's OAuth token
 * (`sk-ant-oat…`) additionally needs the oauth beta header, without which the
 * API rejects it as an unknown key.
 */
export function anthropicHeaders(): Record<string, string> {
  const token = env.anthropicAuthToken();
  const key = env.anthropicKey();
  if (!token && !key) {
    throw new Error("AI לא מוגדר (חסר ANTHROPIC_API_KEY או ANTHROPIC_AUTH_TOKEN)");
  }

  const headers: Record<string, string> = {
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  };
  if (token) {
    headers.authorization = `Bearer ${token}`;
    if (token.startsWith("sk-ant-oat")) headers["anthropic-beta"] = "oauth-2025-04-20";
    return headers;
  }
  headers["x-api-key"] = key;
  return headers;
}

/**
 * Extended-thinking budget per effort level. The copilot's job is judgement over
 * live business state rather than autocomplete, so the default is the deepest
 * one — but thinking is a real token cost on every turn, hence ANTHROPIC_EFFORT.
 * `budget_tokens` must stay under `max_tokens`, which is why both move together.
 */
export function thinkingFor(effort: string): { budget: number; maxTokens: number } {
  switch (effort) {
    case "low":
      return { budget: 0, maxTokens: 4096 };
    case "medium":
      return { budget: 4_000, maxTokens: 12_000 };
    case "high":
      return { budget: 10_000, maxTokens: 20_000 };
    default: // xhigh
      return { budget: 24_000, maxTokens: 32_000 };
  }
}

export async function claudeText(args: {
  prompt: string;
  system?: string;
  maxTokens?: number;
  model?: string;
}): Promise<string> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: anthropicHeaders(),
    body: JSON.stringify({
      model: args.model ?? env.aiModel(),
      max_tokens: args.maxTokens ?? 1024,
      ...(args.system ? { system: args.system } : {}),
      messages: [{ role: "user", content: args.prompt }],
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content?: { type?: string; text?: string }[] };
  // A thinking block can precede the answer, so take the first text block rather
  // than the first block.
  const text = (data.content ?? []).find((b) => b.type === "text" || b.text !== undefined);
  return (text?.text ?? "").trim();
}
