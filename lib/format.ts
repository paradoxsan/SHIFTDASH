// Client-safe formatting helpers (no secrets / server imports).

export function timeAgo(value: string | number | null | undefined): string {
  if (value == null) return "—";
  const d = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  const ms = Date.now() - d.getTime();
  if (Number.isNaN(ms)) return "—";
  const s = Math.round(ms / 1000);
  if (s < 5) return "עכשיו";
  if (s < 60) return `לפני ${s} שנ׳`;
  const m = Math.round(s / 60);
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.round(m / 60);
  if (h < 24) return `לפני ${h} שע׳`;
  const days = Math.round(h / 24);
  return `לפני ${days} ימים`;
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("he-IL").format(n);
}

export function formatCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDateTime(value: string | number | null | undefined): string {
  if (value == null) return "—";
  const d = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

const MEDIA_LABELS: Record<string, string> = {
  image: "📷 תמונה",
  voice: "🎤 הודעה קולית",
  ptt: "🎤 הודעה קולית",
  audio: "🎵 אודיו",
  video: "🎬 וידאו",
  document: "📄 מסמך",
  sticker: "😊 מדבקה",
  location: "📍 מיקום",
  contact: "👤 איש קשר",
  gif: "🎬 GIF",
  poll: "📊 סקר",
};

/** Human label for a non-text WhatsApp message type. */
export function mediaLabel(type: string | null | undefined): string {
  if (!type) return "—";
  return MEDIA_LABELS[type] ?? `[${type}]`;
}

/** Preview text for a message/chat: real text, else caption, else a media label. */
export function messagePreview(
  type: string | null | undefined,
  text: string | null | undefined,
  caption?: string | null
): string {
  if (text && text.trim()) return text;
  if (caption && caption.trim()) return caption;
  if (!type || type === "text") return "";
  return mediaLabel(type);
}

/** Normalize a WhatsApp chat_id like "972501234567@s.whatsapp.net" to a phone. */
export function prettyChatId(chatId: string | null | undefined): string {
  if (!chatId) return "—";
  const base = chatId.split("@")[0];
  if (chatId.includes("@g.us")) return `קבוצה ${base.slice(-6)}`;
  return base.startsWith("972") ? `0${base.slice(3)}` : base;
}
