"use client";

import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client";
import type { SheetLead } from "@/lib/types";
import { EmptyState } from "@/components/ui";
import {
  addDays,
  bucketOf,
  parseReminder,
  relativeLabel,
  todayInIsrael,
  type ReminderBucket,
} from "@/lib/reminders";

interface DueLead {
  lead: SheetLead;
  reminder: string; // normalized YYYY-MM-DD
  bucket: ReminderBucket;
}

const BUCKET_META: Record<ReminderBucket, { label: string; color: string }> = {
  overdue: { label: "באיחור", color: "var(--color-err)" },
  today: { label: "להיום", color: "var(--color-warn)" },
  upcoming: { label: "בקרוב (7 ימים)", color: "var(--color-brand)" },
  later: { label: "מאוחר יותר", color: "var(--color-idle)" },
};
const BUCKET_ORDER: ReminderBucket[] = ["overdue", "today", "upcoming", "later"];

export function RemindersView({
  leads,
  onOpen,
}: {
  leads: SheetLead[];
  onOpen: (lead: SheetLead) => void;
}) {
  const qc = useQueryClient();
  const today = todayInIsrael();

  const grouped = useMemo(() => {
    const g: Record<ReminderBucket, DueLead[]> = {
      overdue: [],
      today: [],
      upcoming: [],
      later: [],
    };
    for (const lead of leads) {
      const reminder = parseReminder(lead.values["תזכורת"]);
      if (!reminder) continue;
      const bucket = bucketOf(reminder, today);
      g[bucket].push({ lead, reminder, bucket });
    }
    for (const b of BUCKET_ORDER) g[b].sort((a, z) => a.reminder.localeCompare(z.reminder));
    return g;
  }, [leads, today]);

  const total = BUCKET_ORDER.reduce((n, b) => n + grouped[b].length, 0);

  // Snooze/clear write only the "תזכורת" cell (PATCH never clobbers other fields).
  const update = useMutation({
    mutationFn: ({ rowIndex, value }: { rowIndex: number; value: string }) =>
      fetchJson("/api/leads", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rowIndex, updates: { "תזכורת": value } }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  if (total === 0) {
    return <EmptyState text="אין תזכורות פתוחות. הוסף תזכורת פולואפ מתוך כרטיס ליד." />;
  }

  return (
    <div className="flex flex-col gap-5">
      {BUCKET_ORDER.map((bucket) => {
        const items = grouped[bucket];
        if (!items.length) return null;
        const meta = BUCKET_META[bucket];
        return (
          <section key={bucket}>
            <div className="flex items-center gap-2 mb-2">
              <span className="dot" style={{ background: meta.color }} />
              <h2 className="font-bold">{meta.label}</h2>
              <span className="text-xs text-[var(--color-muted)]">{items.length}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((d) => (
                <ReminderCard
                  key={d.lead.rowIndex}
                  due={d}
                  today={today}
                  busy={update.isPending}
                  onOpen={() => onOpen(d.lead)}
                  onSnooze={(days) =>
                    update.mutate({
                      // Push forward from today (overdue/today) or from the
                      // existing future date — never pull a reminder earlier.
                      rowIndex: d.lead.rowIndex,
                      value: addDays(d.reminder > today ? d.reminder : today, days),
                    })
                  }
                  onDone={() => update.mutate({ rowIndex: d.lead.rowIndex, value: "" })}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ReminderCard({
  due,
  today,
  busy,
  onOpen,
  onSnooze,
  onDone,
}: {
  due: DueLead;
  today: string;
  busy: boolean;
  onOpen: () => void;
  onSnooze: (days: number) => void;
  onDone: () => void;
}) {
  const { lead, reminder, bucket } = due;
  const meta = BUCKET_META[bucket];
  const name = lead.values["שם"] || lead.values["טלפון"] || "—";
  const notes = lead.values["הערות"] || "";
  const status = lead.values["סטטוס"] || "";
  const domain = lead.values["תחום העסק"] || "";

  return (
    <div className="card p-3 flex flex-col gap-2">
      <button onClick={onOpen} className="text-start flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold truncate">{name}</div>
          <span
            className="chip shrink-0"
            style={{ color: meta.color, borderColor: meta.color }}
          >
            {relativeLabel(reminder, today)}
          </span>
        </div>
        <div className="text-[11px] text-[var(--color-muted)] truncate" dir="ltr">
          {lead.values["טלפון"]}
        </div>
        <div className="text-[11px] text-[var(--color-muted)] truncate">
          {[status, domain, `🔔 ${reminder}`].filter(Boolean).join(" · ")}
        </div>
        {notes && <div className="text-[11px] text-[var(--color-muted)] truncate">📝 {notes}</div>}
      </button>

      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[var(--color-border)]">
        <button
          onClick={onOpen}
          disabled={busy}
          className="btn text-[11px]"
          style={{ color: "var(--color-brand)" }}
        >
          פתח / שלח
        </button>
        <button onClick={() => onSnooze(1)} disabled={busy} className="btn text-[11px]">
          +יום
        </button>
        <button onClick={() => onSnooze(3)} disabled={busy} className="btn text-[11px]">
          +3
        </button>
        <button onClick={() => onSnooze(7)} disabled={busy} className="btn text-[11px]">
          +שבוע
        </button>
        <button
          onClick={onDone}
          disabled={busy}
          className="btn text-[11px]"
          style={{ color: "var(--color-ok)" }}
        >
          בוצע ✓
        </button>
      </div>
    </div>
  );
}
