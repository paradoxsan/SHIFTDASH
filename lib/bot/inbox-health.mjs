/* "Did the bot ignore a customer?" — counting the right rows.
 *
 * `inbox` is the receiver's raw webhook log, not a list of customer messages.
 * On 2026-08-07 the watchdog paged "59 customer messages in 30 min and 0
 * replies" for T-CENTER while the real number was ZERO: 75 of 75 rows were one
 * chat — the owner's personal number, which the bot is designed to ignore —
 * mixed with `from_me:true` rows, i.e. the owner answering from the business
 * phone. Every one of those is the product working.
 *
 * So a row only counts as an unanswered customer message when it is:
 *   · genuinely inbound          (not from_me — cf. webhook-events-are-not-messages)
 *   · from a chat the bot serves (not the owner's own number, not a test line)
 *   · not under a human takeover (human_mode: silence there is the feature)
 *   · not a group                (the bot posts to groups, it does not staff them)
 *
 * Inlined verbatim into the watchdog's "Evaluate" Code node — edit here, not
 * there, so tests/unit/inbox-health.test.ts runs the same bytes. */

/** WhatsApp ids arrive as `972501234567@s.whatsapp.net`; config holds bare
 *  digits. Compare on digits alone so neither side has to remember the suffix.
 *  NB: the regex spells the digit class out as `[^0-9]` on purpose —
 *  build-watchdog.mjs refuses to ship any node parameter containing a
 *  backslash, because scripted PUTs have double-escaped regexes into live
 *  workflows before. Keep this file backslash-free; it is inlined verbatim. */
export function normalizeChatId(chatId) {
  const raw = String(chatId == null ? "" : chatId);
  const local = raw.split("@")[0];
  return local.replace(/[^0-9]/g, "");
}

export function isGroupChat(chatId) {
  return String(chatId == null ? "" : chatId).includes("@g.us");
}

/** An inbox payload → the WhatsApp messages inside it.
 *  Two shapes in production: T-CENTER stores a JSON *string* inside a jsonb
 *  column (so it needs parsing twice), BRJewelry stores text. Rows that are not
 *  webhook envelopes at all (BRJewelry writes vision records like
 *  `{"image":true,...}` into the same table) carry no messages and are ignored. */
export function messagesOf(payload) {
  let value = payload;
  for (let depth = 0; depth < 3 && typeof value === "string"; depth++) {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!value || typeof value !== "object") return [];
  const messages = value.messages;
  if (Array.isArray(messages)) return messages;
  // some receivers hand us a bare message object
  if (typeof value.from_me === "boolean") return [value];
  return [];
}

/** Count the customer messages that genuinely went unanswered.
 *  @param rows      inbox rows for the window: { chat_id, payload }
 *  @param ignore    bare-digit chat ids the bot is not meant to serve
 *  @param paused    chat ids under an active human_mode window
 *  @returns {{count: number, chats: string[], dropped: object}}
 *    `dropped` is kept for the digest — a rule that silently discards most of
 *    its input needs to be able to say so out loud. */
export function realInbound(rows = [], { ignore = [], paused = [] } = {}) {
  const ignoreSet = new Set(ignore.map(normalizeChatId).filter(Boolean));
  const pausedSet = new Set(paused.map(normalizeChatId).filter(Boolean));
  const dropped = { fromMe: 0, ignored: 0, paused: 0, group: 0, notAMessage: 0 };
  const chats = new Set();
  let count = 0;

  for (const row of rows) {
    const messages = messagesOf(row && row.payload);
    if (!messages.length) { dropped.notAMessage++; continue; }
    for (const msg of messages) {
      const chatId = (msg && msg.chat_id) || (row && row.chat_id) || "";
      const key = normalizeChatId(chatId);
      if (msg && msg.from_me === true) { dropped.fromMe++; continue; }
      if (isGroupChat(chatId)) { dropped.group++; continue; }
      if (ignoreSet.has(key)) { dropped.ignored++; continue; }
      if (pausedSet.has(key)) { dropped.paused++; continue; }
      count++;
      chats.add(key);
    }
  }
  return { count, chats: Array.from(chats), dropped };
}

/** One line for the daily digest, so an ignore list that quietly swallows a real
 *  customer is visible instead of invisible. Empty string when nothing dropped. */
export function droppedSummary(dropped = {}) {
  const parts = [];
  if (dropped.fromMe) parts.push(dropped.fromMe + " sent by the business");
  if (dropped.paused) parts.push(dropped.paused + " in human takeover");
  if (dropped.ignored) parts.push(dropped.ignored + " on the ignore list");
  if (dropped.group) parts.push(dropped.group + " group");
  return parts.join(", ");
}
