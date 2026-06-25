// Green API (green-api.com) client for sending WhatsApp messages from Shift
// Digital's SDR number (instance 7107590372). Credentials live in env. Used by
// the LeadManager to send templates / follow-up reminders to leads.
function cfg() {
  const base = (process.env.GREEN_API_BASE || "https://api.green-api.com").replace(/\/+$/, "");
  const instance = process.env.GREEN_API_INSTANCE;
  const token = process.env.GREEN_API_TOKEN;
  if (!instance || !token) {
    throw new Error("Green API not configured (GREEN_API_INSTANCE / GREEN_API_TOKEN)");
  }
  return { base, instance, token };
}

/** Normalize an Israeli phone / chat id to Green API's `<digits>@c.us` form. */
export function toChatId(phoneOrChatId: string): string {
  const v = phoneOrChatId.trim();
  if (v.includes("@")) return v.replace("@s.whatsapp.net", "@c.us");
  let p = v.replace(/\D/g, "");
  if (p.startsWith("0")) p = "972" + p.slice(1);
  else if (p.length === 9) p = "972" + p; // bare 9-digit local number
  return `${p}@c.us`;
}

export function greenConfigured(): boolean {
  return Boolean(process.env.GREEN_API_INSTANCE && process.env.GREEN_API_TOKEN);
}

/** Read-only health check — returns e.g. "authorized". Safe (sends nothing). */
export async function greenGetState(): Promise<string> {
  const { base, instance, token } = cfg();
  const res = await fetch(`${base}/waInstance${instance}/getStateInstance/${token}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Green API getState ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { stateInstance?: string };
  return data.stateInstance ?? "unknown";
}

export async function greenSendMessage(
  to: string,
  message: string
): Promise<{ id: string | null }> {
  const { base, instance, token } = cfg();
  const res = await fetch(`${base}/waInstance${instance}/sendMessage/${token}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chatId: toChatId(to), message }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Green API send ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { idMessage?: string };
  return { id: data.idMessage ?? null };
}
