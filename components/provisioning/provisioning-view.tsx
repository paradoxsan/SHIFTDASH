"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson, postJson } from "@/lib/client";
import { PageHeader, Spinner, ErrorBanner, EmptyState } from "@/components/ui";
import { timeAgo } from "@/lib/format";

interface Job {
  id: string;
  tenant_name: string;
  template_id: string;
  state: string;
  error: string | null;
  mode: "live" | "simulate";
  params: Record<string, unknown>;
  updated_at: string;
}
interface Template { id: string; name: string }

const STATE_HE: Record<string, string> = {
  draft: "טיוטה",
  awaiting_pay_approval: "💲 ממתין לאישור עלות",
  creating_db: "יוצר מסד נתונים",
  deploying_workflow: "פורס אוטומציה",
  awaiting_qr: "📱 ממתין לחיבור וואטסאפ",
  awaiting_prompt_approval: "📝 ממתין לאישור פרומפט",
  activating: "מפעיל",
  live: "חי ✓",
  failed: "נכשל",
  rejected: "נדחה",
  cancelled: "בוטל",
};
// state → the checkpoint awaiting a human decision
const CHECKPOINT_OF: Record<string, string> = {
  awaiting_pay_approval: "pay_approval",
  awaiting_qr: "qr_pairing",
  awaiting_prompt_approval: "prompt_approval",
};

export function ProvisioningView() {
  const qc = useQueryClient();
  const [tenantName, setTenantName] = useState("");
  const [templateId, setTemplateId] = useState("tcenter-sales");
  const [simulate, setSimulate] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const jobsQ = useQuery({
    queryKey: ["prov-jobs"],
    queryFn: () => fetchJson<{ jobs: Job[] }>("/api/provisioning/jobs"),
    refetchInterval: 5_000,
  });
  const templatesQ = useQuery({
    queryKey: ["templates"],
    queryFn: () => fetchJson<{ templates: Template[] }>("/api/templates"),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["prov-jobs"] });
  const start = useMutation({
    mutationFn: () => postJson("/api/provisioning/jobs", { tenantName, templateId, mode: simulate ? "simulate" : "live" }),
    onSuccess: () => { setTenantName(""); setErr(null); invalidate(); },
    onError: (e) => setErr((e as Error).message),
  });
  const decide = useMutation({
    mutationFn: (v: { id: string; kind: string; decision: "approve" | "reject" }) =>
      postJson(`/api/provisioning/jobs/${v.id}/checkpoints/${v.kind}`, { decision: v.decision }),
    onSuccess: invalidate,
    onError: (e) => setErr((e as Error).message),
  });
  const retry = useMutation({
    mutationFn: (id: string) => postJson(`/api/provisioning/jobs/${id}`, {}),
    onSuccess: invalidate,
    onError: (e) => setErr((e as Error).message),
  });

  const jobs = jobsQ.data?.jobs ?? [];
  const templates = templatesQ.data?.templates ?? [];

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <PageHeader title="הקמת בוט" subtitle="צור בוט חדש מתבנית — עם 3 נקודות אישור אנושיות" live={jobsQ.isFetching} />

      <div className="card p-4 mb-5 flex flex-col gap-3">
        <div className="grid md:grid-cols-2 gap-3">
          <input
            value={tenantName}
            onChange={(e) => setTenantName(e.target.value)}
            placeholder="שם העסק (יהפוך לתיקייה ב-n8n)"
            className="rounded-xl bg-[var(--color-surface-2)] px-3 py-2.5 text-sm outline-none"
          />
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="rounded-xl bg-[var(--color-surface-2)] px-3 py-2.5 text-sm outline-none"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <input type="checkbox" checked={simulate} onChange={(e) => setSimulate(e.target.checked)} />
            מצב סימולציה (לא יוצר משאבים אמיתיים / לא עולה כסף)
          </label>
          <button
            onClick={() => start.mutate()}
            disabled={!tenantName.trim() || start.isPending}
            className="chip"
            style={{ borderColor: "var(--color-brand)", color: "var(--color-brand)", opacity: !tenantName.trim() ? 0.5 : 1 }}
          >
            התחל הקמה
          </button>
        </div>
        {!simulate && (
          <div className="text-[11px]" style={{ color: "var(--color-warn)" }}>
            ⚠️ מצב חי — תיעצר בנקודת אישור העלות לפני יצירת כל משאב בתשלום (Owner בלבד).
          </div>
        )}
      </div>

      {err && <ErrorBanner message={err} />}

      {jobsQ.isLoading ? (
        <Spinner />
      ) : jobs.length === 0 ? (
        <EmptyState text="עדיין לא הוקמו בוטים" />
      ) : (
        <div className="flex flex-col gap-2">
          {jobs.map((j) => {
            const cp = CHECKPOINT_OF[j.state];
            return (
              <div key={j.id} className="card p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate text-sm">
                      {j.tenant_name} <span className="text-[var(--color-muted)]">· {j.template_id}</span>
                      {j.mode === "simulate" && <span className="chip mr-2 text-[10px]">סימולציה</span>}
                    </div>
                    <div className="text-[11px] text-[var(--color-muted)] mt-0.5">
                      {STATE_HE[j.state] ?? j.state} · {timeAgo(j.updated_at)}
                    </div>
                  </div>
                  {cp && (
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => decide.mutate({ id: j.id, kind: cp, decision: "approve" })} className="chip" style={{ borderColor: "var(--color-ok)", color: "var(--color-ok)" }}>
                        אשר
                      </button>
                      <button onClick={() => decide.mutate({ id: j.id, kind: cp, decision: "reject" })} className="chip" style={{ borderColor: "var(--color-err)", color: "var(--color-err)" }}>
                        דחה
                      </button>
                    </div>
                  )}
                  {j.error && (
                    <button onClick={() => retry.mutate(j.id)} className="chip shrink-0" style={{ borderColor: "var(--color-warn)", color: "var(--color-warn)" }}>
                      נסה שוב
                    </button>
                  )}
                </div>
                {j.error && <div className="text-[11px] mt-1.5 text-[var(--color-err)] break-words">{j.error}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
