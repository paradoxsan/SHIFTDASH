"use client";

import { Icon } from "@/components/icons";
import { useCopilot } from "./copilot-context";
import type { ChatItem } from "./types";

type Approval = Extract<ChatItem, { kind: "approval" }>;

/** The gate between "the model wants to do this" and it actually happening.
 *  Nothing is executed until אישור is clicked — enforced server-side. */
export function ApprovalCard({ item }: { item: Approval }) {
  const { decide, busy } = useCopilot();

  if (item.decided === "rejected") {
    return (
      <div className="text-[11px] text-[var(--color-muted)] flex items-center gap-1.5 px-1">
        <Icon name="close" size={12} />
        נדחה: {item.summary}
      </div>
    );
  }

  if (item.decided === "approved") {
    return (
      <div
        className="text-[11px] flex items-center gap-1.5 px-1"
        style={{ color: item.failed ? "var(--color-err)" : "var(--color-ok)" }}
      >
        <Icon name={item.failed ? "alert" : "check"} size={12} />
        {item.failed ? `נכשל: ${item.summary}` : `בוצע: ${item.summary}`}
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-3 border"
      style={{
        background: "var(--color-warn-soft)",
        borderColor: "color-mix(in srgb, var(--color-warn) 40%, transparent)",
      }}
    >
      <div className="flex items-start gap-2 mb-2.5">
        <span style={{ color: "var(--color-warn)" }} className="mt-0.5 shrink-0">
          <Icon name="alert" size={15} />
        </span>
        <div className="min-w-0">
          <div className="text-[11px] font-bold" style={{ color: "var(--color-warn)" }}>
            דורש אישור
          </div>
          <div className="text-sm mt-0.5 break-words">{item.summary}</div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => decide(item.toolUseId, true)}
          disabled={busy}
          className="btn btn-sm btn-brand flex-1"
        >
          <Icon name="check" size={14} />
          אשר ובצע
        </button>
        <button
          onClick={() => decide(item.toolUseId, false)}
          disabled={busy}
          className="btn btn-sm flex-1"
        >
          ביטול
        </button>
      </div>
    </div>
  );
}
