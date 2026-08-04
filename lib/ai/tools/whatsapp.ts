// WhatsApp tools. Reading a bot's conversations is how we check it is answering
// sensibly; sending as the bot, or silencing it, reaches a real customer — both
// are writes.
import { z } from "zod";
import { defineTool } from "./types";
import { loadClients, getClient } from "@/lib/registry";
import { listChats, listMessages, sendText, hasWhapi } from "@/lib/whapi";
import { getHumanMode, setHumanMode } from "@/lib/human-mode";

async function resolve(clientId: string) {
  await loadClients();
  const c = getClient(clientId);
  if (!c) throw new Error(`לקוח לא מוכר: ${clientId}`);
  const whapiKey = c.whapiKey ?? c.supabaseRef;
  if (!hasWhapi(whapiKey)) throw new Error(`ללקוח ${c.name} אין ערוץ WHAPI מוגדר`);
  return { client: c, whapiKey };
}

export const chatsTool = defineTool({
  name: "whatsapp_chats",
  description: "השיחות האחרונות בערוץ הוואטסאפ של בוט מסוים, עם ההודעה האחרונה בכל שיחה.",
  risk: "read" as const,
  schema: z.object({
    client: z.string().describe("מזהה הלקוח (slug)"),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  summarize: (i) => `שיחות של ${i.client}`,
  async run({ client, limit }) {
    const { whapiKey } = await resolve(client);
    const chats = await listChats(whapiKey);
    return chats.slice(0, limit ?? 20);
  },
});

export const messagesTool = defineTool({
  name: "whatsapp_messages",
  description:
    "ההודעות בשיחה אחת. השתמש בזה כדי לבדוק איך הבוט ענה בפועל לפני שאתה מסיק מסקנה על תקלה.",
  risk: "read" as const,
  schema: z.object({
    client: z.string(),
    chatId: z.string().describe("מזהה השיחה, למשל 972501234567@s.whatsapp.net"),
  }),
  summarize: (i) => `הודעות בשיחה ${i.chatId}`,
  async run({ client, chatId }) {
    const { whapiKey } = await resolve(client);
    const msgs = await listMessages(whapiKey, chatId);
    // Trim to the tail — a long thread would otherwise dominate the context.
    return msgs.slice(-60).map((m) => ({
      fromMe: m.fromMe,
      type: m.type,
      text: m.text ?? m.caption,
      at: m.timestamp,
    }));
  },
});

export const sendWhatsappTool = defineTool({
  name: "whatsapp_send",
  description:
    "שליחת הודעת טקסט מהערוץ של הבוט אל לקוח קצה. ההודעה מגיעה לאדם אמיתי — נסח בזהירות.",
  risk: "write" as const,
  schema: z.object({
    client: z.string(),
    to: z.string().describe("מזהה השיחה או מספר הטלפון"),
    body: z.string().min(1).max(4000),
  }),
  summarize: (i) => `לשלוח ל-${i.to} בערוץ של ${i.client}: "${i.body.slice(0, 80)}"`,
  audit: (i) => ({ action: "whapi.send", targetType: i.client, targetId: i.to }),
  async run({ client, to, body }) {
    const { whapiKey } = await resolve(client);
    return sendText(whapiKey, to, body);
  },
});

export const humanModeTool = defineTool({
  name: "set_human_mode",
  description:
    "השתקה או החזרה של הבוט בשיחה מסוימת. active=true משתיק את הבוט כדי שאדם יטפל בשיחה. " +
    "עובד רק ללקוחות שיש להם טבלת human_mode.",
  risk: "write" as const,
  schema: z.object({
    client: z.string(),
    chatId: z.string(),
    active: z.boolean().describe("true = אדם משתלט והבוט שותק, false = הבוט חוזר"),
    silenceMinutes: z.number().int().min(1).max(10080).optional().describe("השתקה זמנית בדקות"),
  }),
  summarize: (i) =>
    i.active
      ? `להשתיק את הבוט בשיחה ${i.chatId}${i.silenceMinutes ? ` ל-${i.silenceMinutes} דקות` : ""}`
      : `להחזיר את הבוט לשיחה ${i.chatId}`,
  audit: (i) => ({ action: "human_mode.set", targetType: i.client, targetId: i.chatId }),
  async run({ client, chatId, active, silenceMinutes }) {
    await loadClients();
    const c = getClient(client);
    if (!c) throw new Error(`לקוח לא מוכר: ${client}`);
    return setHumanMode(c.supabaseRef, chatId, active, silenceMinutes);
  },
});

export const humanModeStatusTool = defineTool({
  name: "get_human_mode",
  description: "האם הבוט מושתק בשיחה מסוימת ועד מתי.",
  risk: "read" as const,
  schema: z.object({ client: z.string(), chatId: z.string() }),
  summarize: (i) => `מצב השתקה בשיחה ${i.chatId}`,
  async run({ client, chatId }) {
    await loadClients();
    const c = getClient(client);
    if (!c) throw new Error(`לקוח לא מוכר: ${client}`);
    return getHumanMode(c.supabaseRef, chatId);
  },
});
