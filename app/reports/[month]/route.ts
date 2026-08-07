import { buildMonthlyReport, monthWindow } from "@/lib/reports/monthly";
import { renderReport } from "@/lib/reports/render";
import { signReportToken } from "@/lib/reports/token";
import { originFromRequest } from "@/lib/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

/** Internal monthly report. Behind the normal session gate (see middleware.ts). */
export async function GET(req: Request, { params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  try {
    monthWindow(month); // validates YYYY-MM before we touch the database
  } catch {
    return html("<h1>חודש לא תקין</h1><p>הפורמט הנדרש הוא YYYY-MM, למשל 2026-07.</p>", 400);
  }
  try {
    const report = await buildMonthlyReport(month);
    const origin = originFromRequest(req);
    const clientLinks = Object.fromEntries(
      report.bots.map((b) => [b.id, `${origin}/r/${signReportToken({ month, clientId: b.id })}`])
    );
    return html(renderReport(report, { variant: "internal", clientLinks }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return html(`<h1>הפקת הדוח נכשלה</h1><pre>${msg.replace(/[<>&]/g, "")}</pre>`, 500);
  }
}
