// The system prompt and the compact business snapshot injected with it. The
// snapshot exists so ordinary questions ("מי נפל?") are answered from context
// instead of costing a tool round-trip; anything deeper the agent fetches itself.
import { loadClients } from "../registry";
import { listEvents } from "../events";
import { listWorkflows } from "../n8n";
import { workflowMatchesClient } from "../registry";

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
- פעולות שמשנות מצב מוצגות לדניאל לאישור לפני שהן רצות. אל תגיד שביצעת פעולה כזו לפני שקיבלת תוצאה — נסח אותה כהצעה.
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

export async function systemPrompt(): Promise<string> {
  const snapshot = await businessSnapshot();
  const today = new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    dateStyle: "full",
  }).format(new Date());

  return [
    IDENTITY,
    `\n---\nהיום: ${today} (שעון ישראל)`,
    snapshot ? `\n---\nמצב נוכחי (נקודת התחלה — אמת מול הכלים כשצריך דיוק):\n${snapshot}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
