// Shift Digital's own sales pipeline (the Google Sheet the SDR bot works from).
// This is the agency's business, so it stays — unlike the clients' pipelines.
import { z } from "zod";
import { defineTool } from "./types";
import { listLeads, updateLeadCells } from "@/lib/leads-sheet";
import { greenSendMessage } from "@/lib/green-api";
import { setBotPause } from "@/lib/sdr-control";
import { bucketOf, isDueNow, parseReminder, todayInIsrael } from "@/lib/reminders";

export const leadsListTool = defineTool({
  name: "leads_list",
  description:
    "הלידים של Shift Digital מגוגל שיטס. אפשר לסנן לפי סטטוס, לפי טקסט חופשי, " +
    "או להחזיר רק לידים שהתזכורת שלהם מגיעה היום/באיחור.",
  risk: "read" as const,
  schema: z.object({
    status: z.string().optional().describe("סינון לפי הסטטוס בשיט"),
    search: z.string().optional().describe("חיפוש בשם, בטלפון או בהערות"),
    dueOnly: z.boolean().optional().describe("רק לידים שהתזכורת שלהם היום או באיחור"),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  summarize: () => "רשימת לידים",
  async run({ status, search, dueOnly, limit }) {
    const { leads } = await listLeads();
    const today = todayInIsrael();
    let rows = leads;

    if (status) rows = rows.filter((l) => (l.values["סטטוס"] ?? "") === status);
    if (dueOnly) {
      rows = rows.filter((l) => {
        const iso = parseReminder(l.values["תזכורת"]);
        return iso ? isDueNow(iso, today) : false;
      });
    }
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((l) =>
        Object.values(l.values).some((v) => String(v).toLowerCase().includes(q))
      );
    }

    return rows.slice(0, limit ?? 40).map((l) => {
      const iso = parseReminder(l.values["תזכורת"]);
      return {
        id: l.id,
        rowIndex: l.rowIndex,
        name: l.values["שם"] ?? "",
        phone: l.values["טלפון"] ?? "",
        status: l.values["סטטוס"] ?? "",
        priority: l.values["עדיפות"] ?? "",
        field: l.values["תחום העסק"] ?? "",
        reminder: l.values["תזכורת"] ?? "",
        reminderBucket: iso ? bucketOf(iso, today) : null,
        notes: l.values["הערות"] ?? "",
      };
    });
  },
});

export const leadUpdateTool = defineTool({
  name: "lead_update",
  description:
    "עדכון שדות של ליד בשיט (סטטוס, עדיפות, הערות, תזכורת). כותב רק את השדות שנשלחו.",
  risk: "write" as const,
  schema: z.object({
    rowIndex: z.number().int().describe("מספר השורה בשיט, מ-leads_list"),
    leadName: z.string().optional().describe("שם הליד, לתצוגה באישור"),
    updates: z
      .record(z.string(), z.string())
      .describe('מיפוי כותרת-עמודה לערך, למשל {"סטטוס":"נסגר","תזכורת":"2026-08-10"}'),
  }),
  summarize: (i) =>
    `לעדכן את ${i.leadName ?? `שורה ${i.rowIndex}`}: ${Object.entries(i.updates)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ")}`,
  audit: (i) => ({ action: "lead.update", targetType: "lead", targetId: String(i.rowIndex) }),
  async run({ rowIndex, updates }) {
    await updateLeadCells(rowIndex, updates);
    return { rowIndex, updated: Object.keys(updates) };
  },
});

export const leadSendTool = defineTool({
  name: "lead_send_message",
  description:
    "שליחת הודעת וואטסאפ לליד דרך Green API (הערוץ של Shift Digital), ומשתיק אוטומטית " +
    "את בוט ה-SDR לשעתיים כדי שלא יענה מעל השיחה האנושית.",
  risk: "write" as const,
  schema: z.object({
    phone: z.string().describe("מספר הטלפון של הליד"),
    message: z.string().min(1).max(4000),
    leadName: z.string().optional(),
  }),
  summarize: (i) =>
    `לשלוח ל${i.leadName ?? i.phone}: "${i.message.slice(0, 80)}${i.message.length > 80 ? "…" : ""}"`,
  audit: (i) => ({ action: "lead.send", targetType: "lead", targetId: i.phone }),
  async run({ phone, message }) {
    const sent = await greenSendMessage(phone, message);
    // Best-effort: a failed pause must not make the send look failed.
    let paused = false;
    try {
      await setBotPause(phone, true, 120);
      paused = true;
    } catch {
      /* the SDR pause webhook is optional */
    }
    return { ...sent, botPaused: paused };
  },
});
