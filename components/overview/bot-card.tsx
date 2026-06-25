"use client";

import Link from "next/link";
import type { BotWithMetrics } from "@/lib/types";
import { formatNumber, formatCurrency, timeAgo } from "@/lib/format";
import { Stat, HEALTH_META, HealthDot } from "@/components/ui";

export function BotCard({ bot }: { bot: BotWithMetrics }) {
  const m = bot.metrics;
  const health = HEALTH_META[m.health];

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <HealthDot state={m.health} />
            <h3 className="font-bold truncate">{bot.name}</h3>
          </div>
          <div className="text-[11px] text-[var(--color-muted)] mt-1 truncate" dir="ltr">
            {bot.ref} · {bot.region}
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

      <div className="flex items-center justify-between mt-1 pt-1">
        <span className="text-[11px] text-[var(--color-muted)]">
          פעילות אחרונה: {timeAgo(m.lastActivityAt)}
        </span>
        <div className="flex gap-3">
          {bot.hasWhapi && (
            <Link
              href={`/chat?bot=${bot.ref}`}
              className="text-xs font-bold text-[var(--color-brand)]"
            >
              שיחות
            </Link>
          )}
          <Link
            href={`/database?bot=${bot.ref}`}
            className="text-xs font-bold text-[var(--color-muted)]"
          >
            דאטהבייס
          </Link>
        </div>
      </div>
    </div>
  );
}
