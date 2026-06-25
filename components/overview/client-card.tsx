"use client";

import { useRouter } from "next/navigation";
import { useClientCtx, type ClientInfo } from "@/components/client-context";
import { formatNumber, formatCurrency, timeAgo } from "@/lib/format";
import { Stat, HEALTH_META } from "@/components/ui";

export function ClientCard({ client }: { client: ClientInfo }) {
  const m = client.metrics;
  const health = HEALTH_META[m.health];
  const router = useRouter();
  const { setClientId } = useClientCtx();

  const go = (path: string) => {
    setClientId(client.id);
    router.push(path);
  };

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="dot" style={{ background: client.accent ?? health.color }} />
            <h3 className="font-bold truncate">{client.name}</h3>
          </div>
          <div className="text-[11px] text-[var(--color-muted)] mt-1">
            פעילות אחרונה: {timeAgo(m.lastActivityAt)}
          </div>
        </div>
        <span className="chip shrink-0" style={{ color: health.color }}>
          {health.label}
        </span>
      </div>

      {m.error ? (
        <div className="text-xs text-[var(--color-warn)] leading-relaxed">⚠ {m.error}</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="הודעות היום" value={formatNumber(m.messagesToday)} />
          {m.failedMessages != null && (
            <Stat
              label="תקועות / נכשלו"
              value={formatNumber(m.failedMessages)}
              tone={m.failedMessages > 0 ? "err" : undefined}
            />
          )}
          {m.openOrders != null && (
            <Stat label="הזמנות פתוחות" value={formatNumber(m.openOrders)} tone="brand" />
          )}
          {m.revenueToday != null && (
            <Stat label="הכנסה היום" value={formatCurrency(m.revenueToday)} tone="ok" />
          )}
          {m.newLeads != null && (
            <Stat label="לידים חדשים" value={formatNumber(m.newLeads)} tone="brand" />
          )}
          {m.humanActive != null && (
            <Stat
              label="אדם השתלט"
              value={formatNumber(m.humanActive)}
              tone={m.humanActive > 0 ? "warn" : undefined}
            />
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-1">
        <button onClick={() => go("/workflows")} className="btn text-xs py-1.5 px-2.5">
          אוטומציות
        </button>
        {client.hasWhapi && (
          <button onClick={() => go("/chat")} className="btn text-xs py-1.5 px-2.5">
            שיחות
          </button>
        )}
        <button onClick={() => go("/database")} className="btn text-xs py-1.5 px-2.5">
          דאטהבייס
        </button>
        {client.sheetUrl && (
          <a
            href={client.sheetUrl}
            target="_blank"
            rel="noreferrer"
            className="btn text-xs py-1.5 px-2.5"
          >
            CRM Sheet ↗
          </a>
        )}
      </div>
    </div>
  );
}
