// ── Thin Claude client (BotOps Phase 9) ───────────────────────────────────────
// One cost-aware call. Used by the NL-query (generate a SELECT) and the daily
// digest (summarise cross-bot KPIs). Inert unless ANTHROPIC_API_KEY is set.
import { env } from "../env";

export async function claudeText(args: {
  prompt: string;
  system?: string;
  maxTokens?: number;
  model?: string;
}): Promise<string> {
  const key = env.anthropicKey();
  if (!key) throw new Error("AI not configured (ANTHROPIC_API_KEY missing)");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: args.model ?? "claude-sonnet-4-6",
      max_tokens: args.maxTokens ?? 1024,
      ...(args.system ? { system: args.system } : {}),
      messages: [{ role: "user", content: args.prompt }],
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content?: { text?: string }[] };
  return (data.content?.[0]?.text ?? "").trim();
}
