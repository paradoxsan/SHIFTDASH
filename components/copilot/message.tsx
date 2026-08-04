"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { toolLabel, type ChatItem, type ToolCall } from "./types";

function ToolRow({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);
  const color =
    call.status === "error"
      ? "var(--color-err)"
      : call.status === "ok"
        ? "var(--color-muted)"
        : "var(--color-ai)";

  return (
    <div className="text-[11px]">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!call.preview}
        className="flex items-center gap-1.5 py-0.5 disabled:cursor-default"
        style={{ color }}
      >
        <span className={`dot ${call.status === "running" ? "dot-live" : ""}`} style={{ background: color }} />
        <span className="font-semibold">{toolLabel(call.name)}</span>
        {call.status === "error" && <span>— נכשל</span>}
        {call.preview && <Icon name="chevronDown" size={11} />}
      </button>
      {open && call.preview && (
        <pre
          dir="ltr"
          className="mt-1 mb-1.5 p-2 rounded-lg bg-[var(--color-bg)] text-[10px] leading-relaxed overflow-x-auto max-h-40 text-[var(--color-muted)] whitespace-pre-wrap break-all"
        >
          {call.preview}
        </pre>
      )}
    </div>
  );
}

export function Message({ item }: { item: ChatItem }) {
  if (item.kind === "user") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-se-md bg-[var(--color-brand)] text-white px-3.5 py-2 text-sm whitespace-pre-wrap break-words">
          {item.text}
        </div>
      </div>
    );
  }

  if (item.kind === "error") {
    return (
      <div
        className="text-xs px-3 py-2 rounded-xl"
        style={{ background: "var(--color-err-soft)", color: "var(--color-err)" }}
      >
        {item.message}
      </div>
    );
  }

  if (item.kind === "assistant") {
    return (
      <div className="space-y-1.5">
        {item.tools.length > 0 && (
          <div className="ps-1 space-y-0.5">
            {item.tools.map((t) => (
              <ToolRow key={t.id} call={t} />
            ))}
          </div>
        )}
        {(item.text || item.streaming) && (
          <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {item.text}
            {item.streaming && !item.text && (
              <span className="text-[var(--color-faint)] text-xs">חושב…</span>
            )}
          </div>
        )}
      </div>
    );
  }

  return null;
}
