// Delegation — the agency copilot's ability to ask each client's own agent.
// Marked scope: "agency" so a client agent (and a sub-agent) can never call it:
// the question it carries is free text with no `client` field, so
// assertClientInScope has nothing to check and the scope guarantee would rest
// on the prompt alone.
import { z } from "zod";
import { defineTool } from "./types";
import { askClientAgents, MAX_FANOUT } from "../subagent";

export const askClientAgentsTool = defineTool({
  name: "ask_client_agents",
  description:
    "שואל את הסוכנים הייעודיים של הלקוחות שאלה אחת, במקביל. כל סוכן כזה מגיע עם תיק " +
    "הלקוח שלו — איך הבוט בנוי, מה כבר נשבר — ועם גישה לנתונים החיים של אותו לקוח בלבד. " +
    "השתמש בזה לכל שאלה רוחבית ('מה שלום כל הבוטים?', 'למי יש תקלות פתוחות?') במקום " +
    "לאסוף לבד לקוח-לקוח; התשובות יהיו מעמיקות יותר וייקחו פחות זמן.\n" +
    `השאר את clients ריק כדי לשאול את כולם, או ציין עד ${MAX_FANOUT} מזהים. ` +
    "נסח שאלה אחת ספציפית — כל סוכן רואה רק אותה, בלי שאר השיחה. " +
    "הסוכנים האלה קוראים בלבד; אם צריך פעולה שמשנה מצב, הם יתארו אותה ואתה תציע אותה לאישור.",
  risk: "read" as const,
  scope: "agency" as const,
  schema: z.object({
    question: z
      .string()
      .min(3)
      .max(2000)
      .describe("השאלה שתישאל כל סוכן. עצמאית ומובנת בלי הקשר השיחה הנוכחית."),
    clients: z
      .array(z.string())
      .max(MAX_FANOUT)
      .optional()
      .describe(`מזהי לקוחות (slug) מ-list_clients. השאר ריק כדי לשאול את כל הלקוחות.`),
  }),
  summarize: (i) =>
    `לשאול את הסוכנים של ${i.clients?.length ? i.clients.join(", ") : "כל הלקוחות"}`,
  async run({ question, clients }, ctx) {
    const { results, note } = await askClientAgents({
      clients,
      question,
      actor: ctx.actor,
    });

    return {
      question,
      // Named so the orchestrator attributes each answer to the right client
      // rather than blending three bots' state into one paragraph.
      answers: results.map((r) => ({
        client: r.client,
        ok: r.ok,
        answer: r.answer,
        toolsUsed: r.toolsUsed,
      })),
      ...(note ? { note } : {}),
      ...(results.some((r) => !r.ok)
        ? { warning: "חלק מהסוכנים לא ענו — אמור את זה במפורש ואל תציג את התשובה כמלאה." }
        : {}),
    };
  },
});
