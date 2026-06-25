// Pause / resume the SDR bot for a specific lead, via the n8n "Bot Pause
// Control" webhook we added to the SDR workflow. Writes workflow static data
// (sd.pausedLeads) that the in-flow "Bot Pause Guard" checks before replying.
import { env } from "./env";

export async function setBotPause(
  phone: string,
  paused: boolean,
  minutes?: number
): Promise<{ ok: boolean }> {
  const url = `${env.n8nBaseUrl()}/webhook/sdr-bot-control`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, paused, minutes }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Bot pause webhook ${res.status}: ${await res.text()}`);
  return { ok: true };
}
