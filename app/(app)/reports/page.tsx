import Link from "next/link";
import { headers } from "next/headers";
import { PageHeader } from "@/components/ui";
import { CopyLink } from "@/components/reports/report-links";
import { loadClients } from "@/lib/registry";
import { lastCompleteMonth, monthLabel, prevMonth } from "@/lib/reports/monthly";
import { signReportToken } from "@/lib/reports/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The monthly report already ships itself to WhatsApp on the 1st. This screen is
// for everything after that: reading an older month, and getting the per-client
// link to forward. Signing happens here, on the server — the token is an HMAC
// over AUTH_SECRET and must never be derivable in the browser.
function lastMonths(n: number): string[] {
  const out: string[] = [];
  let m = lastCompleteMonth();
  for (let i = 0; i < n; i++) {
    out.push(m);
    m = prevMonth(m);
  }
  return out;
}

async function origin(): Promise<string> {
  const env = process.env.AUTH_BASE_URL?.replace(/\/+$/, "");
  if (env) return env;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function ReportsPage() {
  const [clients, base] = await Promise.all([loadClients(), origin()]);
  const bots = clients.filter((c) => c.workspace === "clients");
  const months = lastMonths(12);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <PageHeader title="דוחות חודשיים" subtitle="נשלח אליך בוואטסאפ ב-1 בכל חודש" />

      <div className="card p-4 mb-4">
        <p className="text-sm text-[var(--color-muted)]">
          הדוח הפנימי כולל את כל הבוטים, התקלות וההמלצות — רק לעיניים שלך. לכל לקוח יש גרסה
          נפרדת עם נפח, זמינות וביצועים בלבד, בקישור חתום שאפשר להעביר בלי שהלקוח יצטרך חשבון.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {months.map((m) => (
          <div key={m} className="card p-3.5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Link href={`/reports/${m}`} className="font-semibold hover:underline">
                {monthLabel(m)}
              </Link>
              <span className="text-[11px] text-[var(--color-muted)] tnum">{m}</span>
            </div>
            <div className="flex gap-1.5 mt-2.5 flex-wrap">
              {bots.map((c) => (
                <CopyLink
                  key={c.id}
                  label={c.name}
                  url={`${base}/r/${signReportToken({ month: m, clientId: c.id })}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
