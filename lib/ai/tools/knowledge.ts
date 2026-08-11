// The dossier tools — how a client's agent reads and grows what it knows.
//
// `remember_about_client` is declared risk: "write" for two reasons. The obvious
// one is the approval gate: a conclusion the agent drew mid-debug is exactly the
// kind of thing that should be read before it becomes a permanent fact. The
// second is that it therefore runs inside auditedMutation like every other
// write, so a dossier entry carries an actor and an audit row — when a future
// session acts on a remembered "fact", it is traceable to who approved it.
import { z } from "zod";
import { defineTool } from "./types";
import { loadClients, getClient } from "@/lib/registry";
import { KNOWLEDGE_KINDS, addKnowledge, listKnowledge, KIND_LABELS } from "@/lib/ai/knowledge";
import { tenantIdForSlug } from "@/lib/contracts";

async function tenantFor(slug: string): Promise<string> {
  await loadClients();
  if (!getClient(slug)) throw new Error(`לקוח לא מוכר: ${slug}`);
  const tenantId = await tenantIdForSlug(slug);
  if (!tenantId) throw new Error(`ללקוח ${slug} אין רשומה ב-control-plane`);
  return tenantId;
}

export const readKnowledgeTool = defineTool({
  name: "read_client_dossier",
  description:
    "כל מה שידוע על לקוח — ארכיטקטורה, כללי עסק, נהלים, תקלות שהיו, אנשי קשר. " +
    "התיק כבר מוזרק לך בתחילת השיחה בגרסה מקוצרת; קרא לזה רק כשצריך את המלא, " +
    "למשל כשנאמר לך שהתיק קוצר או כשאתה מחפש תקלה ישנה שלא מופיעה למעלה.",
  risk: "read" as const,
  schema: z.object({
    client: z.string().describe("מזהה הלקוח (slug)"),
    kind: z
      .enum(KNOWLEDGE_KINDS)
      .optional()
      .describe("סינון לפי סוג רשומה. ללא סינון — הכל."),
  }),
  summarize: (i) => `תיק הלקוח של ${i.client}`,
  async run({ client, kind }) {
    const tenantId = await tenantFor(client);
    const entries = await listKnowledge(tenantId);
    const filtered = kind ? entries.filter((e) => e.kind === kind) : entries;
    return filtered.map((e) => ({
      id: e.id,
      kind: e.kind,
      title: e.title,
      body: e.body,
      pinned: e.pinned,
      source: e.source,
      updatedAt: e.updatedAt,
    }));
  },
});

export const rememberTool = defineTool({
  name: "remember_about_client",
  description:
    "שמירת ידע עמיד על לקוח לתיק שלו, כדי שהשיחה הבאה תתחיל כשהיא כבר יודעת. " +
    "שמור רק מה שיהיה נכון גם בעוד חודש: איך הבוט בנוי, כלל עסקי, נוהל תפעולי, " +
    "תקלה + הסיבה + הפתרון, או איש קשר. " +
    "אל תשמור מצב רגעי (כמה ריצות נכשלו היום), אל תשמור מה שכבר בתיק, " +
    "ואל תשמור השערה שלא אומתה. כתוב בגוף שלישי, משפט או שניים, כולל תאריך אם רלוונטי.",
  risk: "write" as const,
  schema: z.object({
    client: z.string().describe("מזהה הלקוח (slug)"),
    kind: z
      .enum(KNOWLEDGE_KINDS)
      .describe(
        "architecture=איך הבוט בנוי · business_rule=כלל עסקי · ops=נוהל תפעולי · " +
          "incident=תקלה שהייתה והפתרון · contact=איש קשר"
      ),
    title: z.string().min(3).max(120).describe("כותרת קצרה שאפשר לזהות לפיה"),
    body: z.string().min(10).max(2000).describe("הפירוט — מה בדיוק, ולמה זה משנה"),
    pinned: z
      .boolean()
      .optional()
      .describe("סמן true רק לעובדה נושאת-משקל שחייבת להישאר בתיק גם כשהוא מתמלא"),
  }),
  summarize: (i) => `שמירה לתיק ${i.client} · ${KIND_LABELS[i.kind]}: ${i.title}`,
  audit: (i) => ({
    action: "client_knowledge.add",
    targetType: "client",
    targetId: i.client,
  }),
  async run({ client, kind, title, body, pinned }, ctx) {
    const tenantId = await tenantFor(client);
    const id = await addKnowledge(tenantId, {
      kind,
      title,
      body,
      source: "agent",
      pinned: pinned ?? false,
      createdBy: ctx.actor?.email ?? null,
    });
    return { saved: true, id, client, kind, title };
  },
});
