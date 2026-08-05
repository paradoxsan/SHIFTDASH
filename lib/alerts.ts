// ── Alert presentation (pure) ─────────────────────────────────────────────────
// Turns a raw dashboard_event into the sentence a human should read, plus the
// action to take. Kept pure and free of I/O so the wording is unit-testable and
// shared between the Today screen and any notification channel.
import type { EventType, Severity } from "./monitor/detectors";
import { formatCurrency } from "./format";
import { issueLabel } from "./monitor/output-quality";

export type AlertTone = "err" | "warn" | "brand";

export interface AlertView {
  id: number;
  type: string;
  severity: string;
  tone: AlertTone;
  /** One line naming what is wrong. */
  title: string;
  /** What it means / what to do about it. */
  detail: string;
  clientId: string | null;
  clientName: string | null;
  createdAt: string;
  /** Pre-filled question for the copilot. */
  askPrompt: string;
}

export const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export function severityTone(severity: string): AlertTone {
  if (severity === "critical" || severity === "high") return "err";
  if (severity === "medium") return "warn";
  return "brand";
}

function str(payload: Record<string, unknown> | null, key: string): string {
  const v = payload?.[key];
  return v == null ? "" : String(v);
}
function num(payload: Record<string, unknown> | null, key: string): number | null {
  const v = payload?.[key];
  return typeof v === "number" ? v : null;
}

interface Described {
  title: string;
  detail: string;
}

/** Pure: the human wording for one event type + payload. */
export function describeEvent(
  type: string,
  payload: Record<string, unknown> | null,
  who: string
): Described {
  switch (type as EventType) {
    case "BOT_DOWN":
      return {
        title: `הבוט של ${who} כבוי`,
        detail: "ה-workflow ב-n8n לא פעיל — הבוט לא עונה לאף אחד כרגע.",
      };
    case "CREDENTIAL_EXPIRED":
      return {
        title: `חיבור פג תוקף אצל ${who}`,
        detail:
          `${str(payload, "message") || "שגיאת הרשאה חוזרת ב-n8n."} — צריך לחבר מחדש את החשבון ב-n8n.`,
      };
    case "CHANNEL_DOWN":
      return {
        title: `ערוץ הוואטסאפ של ${who} מנותק`,
        detail: `${str(payload, "detail") || "הערוץ לא מגיב"} — הבוט לא יכול לקבל או לשלוח הודעות.`,
      };
    case "QUEUE_STUCK": {
      const min = num(payload, "oldestNewAgeMin");
      return {
        title: `תור תקוע אצל ${who}`,
        detail: `הודעה ממתינה לעיבוד ${min != null ? `${Math.round(min)} דקות` : "יותר מדי זמן"} — הודעות של לקוחות לא נענות.`,
      };
    }
    case "FAILED_SPIKE":
      return {
        title: `הודעות נכשלות אצל ${who}`,
        detail: `${num(payload, "queueFailed") ?? "הרבה"} הודעות בסטטוס כישלון — שווה בדיקה ו-requeue.`,
      };
    case "N8N_ERROR_SPIKE": {
      const rate = num(payload, "errorRate24h");
      return {
        title: `ריכוז שגיאות אצל ${who}`,
        detail: `${rate != null ? `${Math.round(rate * 100)}% מהריצות` : "חלק גדול מהריצות"} נכשלו ב-24 שעות.`,
      };
    }
    case "BOT_SILENT": {
      const min = num(payload, "lastInboundAgeMin");
      return {
        title: `${who} שקט מדי`,
        detail: `לא נכנסה הודעה ${min != null ? `${Math.round(min / 60)} שעות` : "הרבה זמן"}, למרות שזה בוט עם תנועה. ייתכן שהערוץ או הקמפיין נפלו.`,
      };
    }
    case "RLS_REGRESSION":
      return {
        title: `אבטחת נתונים אצל ${who}`,
        detail: `${num(payload, "rlsDisabledTables") ?? ""} טבלאות ללא RLS — הנתונים חשופים.`,
      };
    case "INTEGRATION_DOWN": {
      const name = str(payload, "integration");
      const labels: Record<string, string> = {
        "green-api": "Green API (שליחת וואטסאפ של הסוכנות)",
        "google-sheets": "גוגל שיטס (ה-CRM של הלידים)",
      };
      return {
        title: `${labels[name] ?? name} לא זמין`,
        detail: str(payload, "detail") || "החיבור נכשל — פעולות שתלויות בו לא יעבדו.",
      };
    }
    case "BAD_BOT_OUTPUT": {
      const total = num(payload, "total");
      const chats = num(payload, "chats");
      const worst = str(payload, "worst");
      const sample = str(payload, "example");
      const label = issueLabel(worst);
      return {
        title: `הבוט של ${who} שולח ${label} ללקוחות`,
        detail:
          `${total ?? "כמה"} הודעות${chats ? ` ב-${chats} שיחות` : ""} בשעות האחרונות לא נראות כמו תשובה לאדם.` +
          (sample ? ` דוגמה: "${sample}"` : "") +
          " הבוט עובד — התוכן הוא מה ששבור.",
      };
    }
    case "PAYMENT_OVERDUE": {
      const days = num(payload, "daysOverdue");
      const amount = num(payload, "overdueAmount");
      return {
        title: `${who} בפיגור תשלום`,
        detail: `${amount != null ? `${formatCurrency(amount, str(payload, "currency") || "ILS")} ` : ""}לא שולם${
          days != null ? `, ${Math.round(days)} ימים אחרי מועד הפירעון` : ""
        }.`,
      };
    }
    default:
      return { title: `${type} — ${who}`, detail: JSON.stringify(payload ?? {}) };
  }
}

export function toAlertView(e: {
  id: number;
  type: string;
  severity: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  bot_id: string | null;
}, client: { id: string; name: string } | null): AlertView {
  const who = client?.name ?? "המערכת";
  const { title, detail } = describeEvent(e.type, e.payload, who);
  return {
    id: e.id,
    type: e.type,
    severity: e.severity,
    tone: severityTone(e.severity),
    title,
    detail,
    clientId: client?.id ?? null,
    clientName: client?.name ?? null,
    createdAt: e.created_at,
    askPrompt: `יש התראה מסוג ${e.type}${client ? ` אצל ${client.name}` : ""}: ${title}. תבדוק מה הסיבה ומה צריך לעשות.`,
  };
}

/** Most urgent first; ties broken by recency. */
export function sortAlerts(alerts: AlertView[]): AlertView[] {
  return [...alerts].sort(
    (a, b) =>
      (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
