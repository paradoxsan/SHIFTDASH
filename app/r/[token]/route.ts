import { buildMonthlyReport } from "@/lib/reports/monthly";
import { renderReport } from "@/lib/reports/render";
import { verifyReportToken } from "@/lib/reports/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

/**
 * Client-facing monthly report, addressed by a signed token instead of a login —
 * these links get forwarded to people who will never have a dashboard account.
 * The token authorises exactly one client × one month and nothing else; anything
 * that fails the HMAC gets a flat 404 with no hint about what was wrong.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ref = verifyReportToken(token);
  if (!ref) return html("<h1>404</h1><p>הקישור אינו תקף.</p>", 404);
  try {
    const report = await buildMonthlyReport(ref.month);
    return html(renderReport(report, { variant: "client", clientId: ref.clientId }));
  } catch {
    return html("<h1>הדוח אינו זמין כרגע</h1><p>נסו שוב מאוחר יותר.</p>", 500);
  }
}
