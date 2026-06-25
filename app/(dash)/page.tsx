"use client";

import { useClientCtx } from "@/components/client-context";
import { ClientCard } from "@/components/overview/client-card";
import { PageHeader, Spinner, Stat, EmptyState } from "@/components/ui";
import { formatNumber } from "@/lib/format";
import type { BotMetrics } from "@/lib/types";

export default function OverviewPage() {
  const { workspace, workspaces, wsClients, isLoading, isFetching } = useClientCtx();
  const wsLabel = workspaces.find((w) => w.id === workspace)?.label ?? "";
  const sum = (pick: (m: BotMetrics) => number | null) =>
    wsClients.reduce((acc, c) => acc + (pick(c.metrics) ?? 0), 0);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <PageHeader
        title={`סקירה — ${wsLabel}`}
        subtitle="לחיצה על לקוח פותחת את הכלים שלו"
        live={isFetching}
      />

      {wsClients.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-5">
          <Stat label={workspace === "mine" ? "עסקים" : "לקוחות"} value={formatNumber(wsClients.length)} />
          <Stat label="הודעות היום" value={formatNumber(sum((m) => m.messagesToday))} />
          <Stat
            label="תקועות / נכשלו"
            value={formatNumber(sum((m) => m.failedMessages))}
            tone={sum((m) => m.failedMessages) > 0 ? "err" : undefined}
          />
          <Stat
            label="אדם השתלט"
            value={formatNumber(sum((m) => m.humanActive))}
            tone={sum((m) => m.humanActive) > 0 ? "warn" : undefined}
          />
        </div>
      )}

      {isLoading ? (
        <Spinner label="מגלה את הבוטים שלך…" />
      ) : wsClients.length === 0 ? (
        <EmptyState text="אין כאן עדיין — הוסף לקוחות ב-lib/registry.ts" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {wsClients.map((c) => (
            <ClientCard key={c.id} client={c} />
          ))}
        </div>
      )}
    </div>
  );
}
