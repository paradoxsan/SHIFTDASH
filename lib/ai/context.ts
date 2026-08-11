// The system prompt and the compact business snapshot injected with it. The
// snapshot exists so ordinary questions ("מי נפל?") are answered from context
// instead of costing a tool round-trip; anything deeper the agent fetches itself.
//
// Two shapes of agent are built here from the same machinery:
//   • the AGENCY copilot — sees every client, the default.
//   • a CLIENT agent — pinned to one customer, carrying that customer's dossier
//     (lib/ai/knowledge.ts) and only that customer's live state. This is what
//     makes a debug session resumable: the agent starts already knowing how the
//     bot is wired and what has broken before, instead of re-deriving it.
import { loadClients, getClient, type ClientDef } from "../registry";
import { listEvents } from "../events";
import { listWorkflows } from "../n8n";
import { workflowMatchesClient } from "../registry";
import { knowledgeForSlug, renderDossier } from "./knowledge";
import { getContractBySlug } from "../contracts";
import { getClientAgent } from "./client-agents";
import { listBotIdentity } from "../control-plane";

const SNAPSHOT_TTL_MS = 60_000;
let cache: { at: number; text: string } | null = null;

const IDENTITY = `אתה העוזר של דניאל, בעלים ומייסד של Shift Digital — חברה שבונה ומתחזקת נציגי AI (בוטים) בוואטסאפ לעסקים.

אתה יושב בתוך חדר הבקרה של הסוכנות ויש לך גישה למערכות האמיתיות: n8n, Supabase של כל לקוח, WHAPI, Green API, וגוגל שיטס.

**מה חשוב לדניאל:**
1. הבוטים של הלקוחות עובדים — תקלות, שגיאות, credentials שפגו, ערוץ שנפל. זו האחריות שלו כספק.
2. הלקוחות שילמו לו — דמי הקמה חד-פעמיים ודמי תחזוקה חודשיים.
3. כמה נכנס וכמה יצא בעסק שלו.
4. הלידים שלו — ה-pipeline של Shift Digital.

**מה לא מעניין אותו:** המידע העסקי הפנימי של הלקוחות (כמה הזמנות יש ל-T center, כמה לידים ל-BRJewelry). זה המידע שלהם. תסתכל על נתוני לקוח רק כשזה משרת אבחון תקלה או שאלה שנשאלה במפורש.

**איך לעבוד:**
- ענה בעברית, קצר וישיר. בלי הקדמות ובלי לחזור על השאלה.
- בדוק לפני שאתה טוען. אם אתה לא בטוח — הרץ כלי, אל תנחש. אל תמציא מספרים.
- כשמשהו שבור, אבחן עד השורש (n8n_executions → n8n_execution_detail) לפני שאתה מציע פתרון.
- לכל לקוח יש סוכן ייעודי שמכיר אותו לעומק. בשאלה רוחבית ("מה שלום כל הבוטים?") קרא ל-ask_client_agents במקום לאסוף לבד לקוח-לקוח — הם עונים במקביל וכל אחד מגיע עם תיק הלקוח שלו. סנתז את התשובות וייחס כל ממצא ללקוח שלו; אם סוכן לא ענה, אמור את זה.
- פעולות שמשנות מצב מוצגות לדניאל לאישור לפני שהן רצות. אל תגיד שביצעת פעולה כזו לפני שקיבלת תוצאה — נסח אותה כהצעה. גם כשסוכן משנה המליץ על פעולה — הוא לא ביצע אותה, אתה מציע אותה.
- אם פעולה נדחתה, אל תנסה שוב באותה צורה.
- שים לב שמספרי טלפון ושמות לקוחות הם אנשים אמיתיים. הודעה שנשלחת מגיעה ליעד.`;

async function buildSnapshot(): Promise<string> {
  const parts: string[] = [];

  const clients = await loadClients().catch(() => []);
  if (clients.length) {
    parts.push(
      `לקוחות (slug — שם — סביבה):\n` +
        clients.map((c) => `- ${c.id} — ${c.name} — ${c.workspace}`).join("\n")
    );
  }

  // Inactive workflows are the single most common cause of "the bot stopped".
  try {
    const workflows = await listWorkflows();
    const off = workflows.filter((w) => !w.active && !w.archived);
    if (off.length) {
      const byClient = clients
        .map((c) => ({ c, off: off.filter((w) => workflowMatchesClient(c, w.name)) }))
        .filter((x) => x.off.length);
      if (byClient.length) {
        parts.push(
          `workflows כבויים כרגע:\n` +
            byClient.map((x) => `- ${x.c.name}: ${x.off.map((w) => w.name).join(", ")}`).join("\n")
        );
      }
    }
  } catch {
    /* n8n unreachable — the agent can still work, it just has to ask */
  }

  try {
    const open = await listEvents({ status: "open", limit: 50 });
    if (open.length) {
      const counts = open.reduce<Record<string, number>>((acc, e) => {
        acc[e.type] = (acc[e.type] ?? 0) + 1;
        return acc;
      }, {});
      parts.push(
        `התראות פתוחות: ${Object.entries(counts)
          .map(([t, n]) => `${t}×${n}`)
          .join(", ")} (פרטים ב-list_events)`
      );
    } else {
      parts.push("אין התראות פתוחות.");
    }
  } catch {
    /* control plane unreachable */
  }

  return parts.join("\n\n");
}

/** Cached snapshot — refreshed at most once a minute. */
export async function businessSnapshot(): Promise<string> {
  if (cache && Date.now() - cache.at < SNAPSHOT_TTL_MS) return cache.text;
  const text = await buildSnapshot().catch(() => "");
  cache = { at: Date.now(), text };
  return text;
}

// ── Client agent ──────────────────────────────────────────────────────────────

/**
 * Identity for an agent pinned to one customer. The "you cannot see other
 * clients" line is not a security control — executeTool enforces that — but
 * saying it stops the model wasting turns on calls that will be rejected.
 */
function clientIdentity(agentName: string, client: ClientDef): string {
  return `אתה ${agentName} — הסוכן הייעודי של הלקוח **${client.name}** בתוך חדר הבקרה של Shift Digital.

אתה עובד מול דניאל, בעלים ומייסד של Shift Digital, שבנה ומתחזק את הבוט של ${client.name}.

**התפקיד שלך:** אתה מכיר את הלקוח הזה לעומק — איך הבוט שלו בנוי, מה כבר נשבר בעבר, איך העסק שלו עובד. כשמשהו לא עובד אצל ${client.name}, אתה זה שמאבחן. אתה לא מתחיל מאפס בכל שיחה: מה שכתוב בתיק הלקוח למטה זה מה שכבר למדנו.

**גבולות:** אתה רואה רק את ${client.name}. אין לך גישה לנתונים של לקוחות אחרים, וכלי שתקרא לו עם לקוח אחר יידחה. אם נשאלת על לקוח אחר — אמור שצריך לפנות לסוכן שלו.

**איך לעבוד:**
- ענה בעברית, קצר וישיר. בלי הקדמות ובלי לחזור על השאלה.
- בדוק לפני שאתה טוען. אם אתה לא בטוח — הרץ כלי, אל תנחש. אל תמציא מספרים.
- כשמשהו שבור, אבחן עד השורש (n8n_executions → n8n_execution_detail) לפני שאתה מציע פתרון.
- תיק הלקוח הוא ידע מצטבר, לא אמת מוחלטת. אם הוא סותר את מה שהכלים מראים — הכלים מנצחים, ותגיד שהתיק צריך עדכון.
- כשלמדת משהו חדש ועמיד על הלקוח — משהו ששווה לדעת בשיחה הבאה — הצע לשמור אותו עם remember_about_client. אל תשמור מה שכבר כתוב בתיק, ואל תשמור פרטים חד-פעמיים.
- פעולות שמשנות מצב מוצגות לדניאל לאישור לפני שהן רצות. אל תגיד שביצעת פעולה כזו לפני שקיבלת תוצאה — נסח אותה כהצעה.
- אם פעולה נדחתה, אל תנסה שוב באותה צורה.
- שים לב שמספרי טלפון הם אנשים אמיתיים. הודעה שנשלחת מגיעה ליעד.`;
}

/** The client's own configuration — the facts an agent should never have to ask for. */
function clientProfile(client: ClientDef): string {
  const lines = [
    `- מזהה (slug): ${client.id}`,
    `- פרויקט Supabase: ${client.supabaseRef}`,
    `- workflows ב-n8n מזוהים לפי: ${client.n8nPrefixes.join(", ") || "—"}`,
  ];
  if (client.tables?.length) lines.push(`- טבלאות הלקוח: ${client.tables.join(", ")}`);
  if (client.excludeTables?.length)
    lines.push(`- הפרויקט משותף; לא שייך ללקוח: ${client.excludeTables.join(", ")}`);
  if (client.sheetId) lines.push(`- Google Sheet: ${client.sheetId}`);
  return lines.join("\n");
}

/** Live state for ONE client — the agency snapshot narrowed to its own bot. */
async function clientSnapshot(client: ClientDef): Promise<string> {
  const parts: string[] = [];

  try {
    const workflows = (await listWorkflows()).filter(
      (w) => !w.archived && workflowMatchesClient(client, w.name)
    );
    if (workflows.length) {
      const off = workflows.filter((w) => !w.active);
      parts.push(
        `workflows (${workflows.length}): ${workflows.map((w) => w.name).join(", ")}` +
          (off.length ? `\n⚠️ כבויים כרגע: ${off.map((w) => w.name).join(", ")}` : "")
      );
    }
  } catch {
    /* n8n unreachable — the agent can still work, it just has to ask */
  }

  try {
    // Events carry a bot id, so narrowing needs the slug→id map rather than a
    // name match. A client with no bot row simply shows no events here.
    const [identities, open] = await Promise.all([
      listBotIdentity().catch(() => [] as { id: string; slug: string }[]),
      listEvents({ status: "open", limit: 100 }),
    ]);
    const botId = identities.find((b) => b.slug === client.id)?.id ?? null;
    const mine = botId ? open.filter((e) => e.bot_id === botId) : [];
    parts.push(
      mine.length
        ? `התראות פתוחות: ${mine.map((e) => `${e.type}(${e.severity})`).join(", ")} — פרטים ב-list_events`
        : "אין התראות פתוחות."
    );
  } catch {
    /* control plane unreachable */
  }

  try {
    const contract = await getContractBySlug(client.id);
    if (contract) {
      const contact = [contract.contactName, contract.contactPhone].filter(Boolean).join(" · ");
      if (contact) parts.push(`איש קשר אצל הלקוח: ${contact}`);
    }
  } catch {
    /* contract optional */
  }

  return parts.join("\n\n");
}

/**
 * Appended when this client agent is answering the agency copilot rather than
 * Daniel. Two things change: nobody is watching, so a write cannot be approved
 * and must be described instead; and the answer is consumed by another model,
 * so it should be dense fact rather than conversational framing.
 */
const SUBAGENT_BRIEF = `\n---\n**איך אתה נקרא עכשיו:** לא דניאל שואל אותך — הקופיילוט של הסוכנות האציל לך שאלה אחת, והתשובה שלך חוזרת אליו כדי שיסנתז אותה עם תשובות של סוכנים אחרים.

- אתה רואה את השאלה בלבד, בלי שאר השיחה. אם היא עמומה, ענה על הקריאה הסבירה ביותר ואמור באיזו הנחה בחרת.
- אין לך כלים שמשנים מצב בהקשר הזה, ואין מי שיאשר אותם. אם צריך פעולה — תאר בדיוק מה צריך לעשות (איזה workflow, איזה ערך) והקופיילוט יציע את זה לדניאל לאישור.
- ענה קצר וצפוף: עובדות, מספרים, שמות workflows. בלי פתיחים, בלי "שאלה מצוינת", בלי לחזור על השאלה.
- הרץ כלים לפני שאתה קובע. אם לא הצלחת לבדוק משהו — אמור שלא בדקת. תשובה בטוחה שמבוססת על התיק בלבד מסוכנת פה יותר מרגיל, כי מי שקורא אותה לא יודע שלא בדקת.`;

export interface SystemPromptOptions {
  /** Bot slug. Omit for the agency-wide copilot. */
  client?: string | null;
  /** Building the prompt for a nested (delegated) turn — see SUBAGENT_BRIEF. */
  forSubAgent?: boolean;
}

/**
 * Build the system prompt. With no client this is the agency copilot, unchanged.
 * With a client it is that customer's dedicated agent: its persona, its dossier,
 * its live state — and nobody else's.
 */
export async function systemPrompt(opts: SystemPromptOptions = {}): Promise<string> {
  const today = new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    dateStyle: "full",
  }).format(new Date());
  const dateLine = `\n---\nהיום: ${today} (שעון ישראל)`;

  if (opts.client) {
    await loadClients();
    const client = getClient(opts.client);
    if (!client) throw new Error(`לקוח לא מוכר: ${opts.client}`);

    const [agent, entries, snapshot] = await Promise.all([
      getClientAgent(client.id).catch(() => null),
      knowledgeForSlug(client.id).catch(() => []),
      clientSnapshot(client).catch(() => ""),
    ]);
    const dossier = renderDossier(entries);

    return [
      clientIdentity(agent?.displayName || `הסוכן של ${client.name}`, client),
      agent?.persona ? `\n---\nהנחיות ספציפיות ללקוח הזה:\n${agent.persona}` : "",
      dateLine,
      `\n---\nהגדרות הלקוח:\n${clientProfile(client)}`,
      dossier
        ? `\n---\n## תיק הלקוח — ${client.name}\nמה שכבר למדנו על הלקוח הזה. זו נקודת הפתיחה שלך:\n\n${dossier}`
        : `\n---\n## תיק הלקוח — ${client.name}\nהתיק ריק עדיין. כשתלמד משהו עמיד על הלקוח, הצע לשמור אותו עם remember_about_client.`,
      snapshot ? `\n---\nמצב נוכחי (אמת מול הכלים כשצריך דיוק):\n${snapshot}` : "",
      opts.forSubAgent ? SUBAGENT_BRIEF : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const snapshot = await businessSnapshot();
  return [
    IDENTITY,
    dateLine,
    snapshot ? `\n---\nמצב נוכחי (נקודת התחלה — אמת מול הכלים כשצריך דיוק):\n${snapshot}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
