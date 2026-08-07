"use client";

import { Suspense, useState } from "react";
import { PageHeader, Spinner, Tabs, EmptyState, type TabDef } from "@/components/ui";
import { useClientCtx } from "@/components/client-context";
import { WorkflowsPanel } from "@/components/system/workflows-panel";
import { ExecutionsPanel } from "@/components/system/executions-panel";
import { EventsInbox } from "@/components/events/events-inbox";
import { QueueMonitor } from "@/components/ops/queue-monitor";
import { HumanWatchlist } from "@/components/ops/human-watchlist";
import { DbExplorer } from "@/components/database/db-explorer";
import { ProvisioningView } from "@/components/provisioning/provisioning-view";
import { AnalyticsView } from "@/components/analytics/analytics-view";

// Everything under the hood, in one place. These were six separate nav items in
// the old shell; none is a daily destination, and splitting them made the nav
// read like a list of vendors (n8n, Supabase) instead of a list of jobs.
//
// Two rows rather than one long scroll, because they answer different questions:
// "is something wrong right now" vs "let me look inside". A single eight-tab row
// hid half of them behind a horizontal scroll on a phone.
const OPS: TabDef[] = [
  { id: "alerts", label: "התראות" },
  { id: "queue", label: "תור תקועים" },
  { id: "watchlist", label: "השתלטות אנושית" },
];

const MACHINE: TabDef[] = [
  { id: "automations", label: "אוטומציות" },
  { id: "runs", label: "ריצות" },
  { id: "database", label: "דאטהבייס" },
  { id: "provisioning", label: "הקמת בוט" },
  { id: "analytics", label: "אנליטיקה" },
];

const HINTS: Record<string, string> = {
  alerts: "אירועים פתוחים מכל הבוטים — אישור וסגירה",
  queue: "הודעות נכנסות שנתקעו או נכשלו, עם requeue",
  watchlist: "שיחות שהבוט מושתק בהן, ממוינות לפי משך",
  automations: "ה-workflows של n8n והמתג להדליק/לכבות",
  runs: "פיד ריצות חי; ריצה שנכשלה נפתחת לפירוט השגיאה",
  database: "סייר הטבלאות של הבוט הפעיל",
  provisioning: "הקמת בוט חדש — מצב סימולציה כברירת מחדל",
  analytics: "שעות עומס, הכנסות ושאילתה חופשית",
};

/** Tabs that are meaningless without knowing WHICH bot you're looking at. */
const NEEDS_CLIENT = new Set(["queue", "watchlist", "database"]);

export function SystemView() {
  const [tab, setTab] = useState<string>("alerts");
  const { activeClient } = useClientCtx();
  const blocked = NEEDS_CLIENT.has(tab) && !activeClient;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <PageHeader title="חדר מכונות" subtitle={activeClient?.name ?? "כל הבוטים"} />

      <div className="flex flex-col gap-2 mb-4">
        <Tabs tabs={OPS} active={tab} onChange={setTab} />
        <Tabs tabs={MACHINE} active={tab} onChange={setTab} />
        <p className="text-xs text-[var(--color-muted)] mt-1">{HINTS[tab]}</p>
      </div>

      {blocked ? (
        <EmptyState text="בחר לקוח מלמעלה כדי לראות את הנתונים שלו" />
      ) : (
        <>
          {tab === "alerts" && <EventsInbox />}
          {tab === "queue" && activeClient && <QueueMonitor botRef={activeClient.supabaseRef} />}
          {tab === "watchlist" && activeClient && <HumanWatchlist clientId={activeClient.id} />}
          {tab === "automations" && <WorkflowsPanel />}
          {tab === "runs" && <ExecutionsPanel />}
          {tab === "database" && (
            <Suspense fallback={<Spinner />}>
              <DbExplorer />
            </Suspense>
          )}
          {tab === "provisioning" && (
            <Suspense fallback={<Spinner />}>
              <ProvisioningView />
            </Suspense>
          )}
          {tab === "analytics" && (
            <Suspense fallback={<Spinner />}>
              <AnalyticsView />
            </Suspense>
          )}
        </>
      )}
    </div>
  );
}
