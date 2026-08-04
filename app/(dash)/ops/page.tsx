"use client";

import { useState } from "react";
import { PageHeader, EmptyState } from "@/components/ui";
import { useClientCtx } from "@/components/client-context";
import { QueueMonitor } from "@/components/ops/queue-monitor";
import { HumanWatchlist } from "@/components/ops/human-watchlist";
import { PaymentChase } from "@/components/ops/payment-chase";
import { EventsInbox } from "@/components/events/events-inbox";

type Tab = "alerts" | "queue" | "watchlist" | "chase";

const TABS: { key: Tab; label: string }[] = [
  { key: "alerts", label: "התראות" },
  { key: "queue", label: "תור תקועים" },
  { key: "watchlist", label: "השתלטות אנושית" },
  { key: "chase", label: "גביית תשלומים" },
];

export default function OpsPage() {
  const [tab, setTab] = useState<Tab>("alerts");
  const { activeClient } = useClientCtx();

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <PageHeader
        title="מוקד תפעול"
        subtitle={`${activeClient?.name ?? "בחר לקוח"} · פעולות מהירות`}
      />

      <div className="flex gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="chip"
            style={
              tab === t.key
                ? { borderColor: "var(--color-brand)", color: "var(--color-brand)" }
                : { opacity: 0.6 }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "alerts" ? (
        <EventsInbox />
      ) : !activeClient ? (
        <EmptyState text="בחר לקוח מלמעלה כדי לנהל את התור, ההשתלטות והגבייה" />
      ) : tab === "queue" ? (
        <QueueMonitor botRef={activeClient.supabaseRef} />
      ) : tab === "watchlist" ? (
        <HumanWatchlist clientId={activeClient.id} />
      ) : (
        <PaymentChase botRef={activeClient.supabaseRef} />
      )}
    </div>
  );
}
