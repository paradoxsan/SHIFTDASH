"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson, postJson } from "@/lib/client";
import { formatDateTime } from "@/lib/format";

interface State {
  active: boolean;
  silencedUntil: string | null;
}

export function HumanModeToggle({ clientId, chatId }: { clientId: string; chatId: string }) {
  const qc = useQueryClient();
  const key = ["human", clientId, chatId];
  const [err, setErr] = useState<string | null>(null);

  const q = useQuery({
    queryKey: key,
    queryFn: () =>
      fetchJson<State>(`/api/clients/${clientId}/human-mode?chatId=${encodeURIComponent(chatId)}`),
    refetchInterval: 8_000,
  });

  const m = useMutation({
    mutationFn: (v: { active: boolean; silenceMinutes?: number }) =>
      postJson(`/api/clients/${clientId}/human-mode`, { chatId, ...v }),
    // Optimistic: flip the UI immediately so the click clearly "works".
    onMutate: async (v) => {
      setErr(null);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<State>(key);
      qc.setQueryData<State>(key, { active: v.active, silencedUntil: prev?.silencedUntil ?? null });
      return { prev };
    },
    onError: (e, _v, ctx) => {
      setErr((e as Error).message);
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const active = q.data?.active ?? false;
  const busy = m.isPending;

  return (
    <div className="flex items-center gap-1.5 flex-wrap justify-end">
      <button
        onClick={() => m.mutate({ active: !active })}
        disabled={busy}
        className="chip"
        title={active ? "הבוט מושהה — לחץ להפעלה" : "הבוט פעיל — לחץ להשתקה"}
        style={{
          borderColor: active ? "var(--color-warn)" : "var(--color-ok)",
          color: active ? "var(--color-warn)" : "var(--color-ok)",
          opacity: busy ? 0.55 : 1,
        }}
      >
        <span
          className="dot"
          style={{ background: active ? "var(--color-warn)" : "var(--color-ok)" }}
        />
        {active ? "בוט מושהה" : "בוט פעיל"}
      </button>

      {!active ? (
        <>
          <button
            onClick={() => m.mutate({ active: true, silenceMinutes: 120 })}
            disabled={busy}
            className="chip opacity-80"
          >
            השתק 2ש׳
          </button>
          <button
            onClick={() => m.mutate({ active: true, silenceMinutes: 720 })}
            disabled={busy}
            className="chip opacity-80"
          >
            היום
          </button>
        </>
      ) : (
        q.data?.silencedUntil && (
          <span className="text-[10px] text-[var(--color-muted)]">
            עד {formatDateTime(q.data.silencedUntil)}
          </span>
        )
      )}

      {err && (
        <span className="text-[10px]" style={{ color: "var(--color-err)" }}>
          שגיאה
        </span>
      )}
    </div>
  );
}
