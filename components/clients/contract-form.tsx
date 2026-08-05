"use client";

// The agreement section of a client card. Saves the whole section at once via
// PUT /api/clients/[client]/contract — the server is owner-only and audited, so
// this component only has to get the shapes right.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client";
import { Icon } from "@/components/icons";
import { Card, CardHeader } from "@/components/ui";
import type { ContractView } from "./shared";

interface MorningClientsData {
  connected: boolean;
  clients: { id: string; name: string }[];
}

/** Text inputs hold strings; "" means "cleared", which the API stores as null. */
interface FormState {
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  startedOn: string;
  setupFee: string;
  monthlyFee: string;
  currency: string;
  billingStatus: string;
  morningClientId: string;
  notes: string;
}

function toForm(c: ContractView | null): FormState {
  return {
    contactName: c?.contactName ?? "",
    contactPhone: c?.contactPhone ?? "",
    contactEmail: c?.contactEmail ?? "",
    startedOn: c?.startedOn ?? "",
    setupFee: c?.setupFee != null ? String(c.setupFee) : "",
    monthlyFee: c?.monthlyFee != null ? String(c.monthlyFee) : "",
    currency: c?.currency ?? "ILS",
    billingStatus: c?.billingStatus ?? "active",
    morningClientId: c?.morningClientId ?? "",
    notes: c?.notes ?? "",
  };
}

/** "" → null so a cleared fee is stored as unknown, not as 0. */
function feeOrNull(v: string): number | null {
  const s = v.trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-[var(--color-muted)] mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-[var(--color-faint)] mt-1">{hint}</span>}
    </label>
  );
}

export function ContractForm({
  clientId,
  contract,
}: {
  clientId: string;
  contract: ContractView | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() => toForm(contract));
  const [saved, setSaved] = useState(false);

  // A background refetch that brings newer data must not clobber the fields the
  // user is editing — only re-seed when the saved revision actually changes.
  useEffect(() => {
    setForm(toForm(contract));
  }, [contract?.updatedAt, contract?.tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const morningClients = useQuery({
    queryKey: ["morning-clients"],
    queryFn: () => fetchJson<MorningClientsData>("/api/money/morning-clients"),
    staleTime: 10 * 60_000,
  });

  const save = useMutation({
    mutationFn: () =>
      fetchJson<{ contract: ContractView | null }>(`/api/clients/${clientId}/contract`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactName: form.contactName.trim(),
          contactPhone: form.contactPhone.trim(),
          contactEmail: form.contactEmail.trim(),
          startedOn: form.startedOn,
          setupFee: feeOrNull(form.setupFee),
          monthlyFee: feeOrNull(form.monthlyFee),
          currency: form.currency,
          billingStatus: form.billingStatus,
          morningClientId: form.morningClientId,
          notes: form.notes.trim(),
        }),
      }),
    onSuccess: () => {
      setSaved(true);
      // The payment badge and the MRR total both derive from this row.
      qc.invalidateQueries({ queryKey: ["client-card", clientId] });
      qc.invalidateQueries({ queryKey: ["clients-overview"] });
      qc.invalidateQueries({ queryKey: ["money"] });
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Card>
      <CardHeader
        title="ההתקשרות"
        subtitle={contract ? undefined : "עוד לא הוזן הסכם ללקוח הזה"}
        icon={<Icon name="doc" size={16} />}
      />
      <div className="px-4 pb-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="איש קשר">
            <input className="input" value={form.contactName} onChange={set("contactName")} />
          </Field>
          <Field label="טלפון">
            <input
              className="input"
              inputMode="tel"
              dir="ltr"
              value={form.contactPhone}
              onChange={set("contactPhone")}
            />
          </Field>
          <Field label="אימייל">
            <input
              className="input"
              type="email"
              dir="ltr"
              value={form.contactEmail}
              onChange={set("contactEmail")}
            />
          </Field>
          <Field label="תחילת התקשרות">
            <input
              className="input"
              type="date"
              dir="ltr"
              value={form.startedOn}
              onChange={set("startedOn")}
            />
          </Field>
          <Field label="דמי הקמה (חד־פעמי)">
            <input
              className="input tnum"
              inputMode="decimal"
              dir="ltr"
              value={form.setupFee}
              onChange={set("setupFee")}
            />
          </Field>
          <Field label="תחזוקה חודשית" hint="מזין את ה-MRR במסך הכסף">
            <input
              className="input tnum"
              inputMode="decimal"
              dir="ltr"
              value={form.monthlyFee}
              onChange={set("monthlyFee")}
            />
          </Field>
          <Field label="מטבע">
            <select className="input" value={form.currency} onChange={set("currency")}>
              <option value="ILS">₪ שקל</option>
              <option value="USD">$ דולר</option>
              <option value="EUR">€ אירו</option>
            </select>
          </Field>
          <Field label="סטטוס">
            <select className="input" value={form.billingStatus} onChange={set("billingStatus")}>
              <option value="active">פעיל</option>
              <option value="paused">מושהה</option>
              <option value="churned">עזב</option>
            </select>
          </Field>
        </div>

        <Field
          label="לקוח ב-Morning"
          hint="הקישור שמאפשר לדעת אם הלקוח שילם. נבחר פעם אחת."
        >
          {morningClients.data?.connected ? (
            <select className="input" value={form.morningClientId} onChange={set("morningClientId")}>
              <option value="">— לא מקושר —</option>
              {morningClients.data.clients.map((mc) => (
                <option key={mc.id} value={mc.id}>
                  {mc.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-xs text-[var(--color-muted)] py-2">
              {morningClients.isLoading ? "טוען…" : "Morning לא מחובר — אי אפשר לקשר עדיין."}
            </div>
          )}
        </Field>

        <Field label="הערות">
          <textarea
            className="input min-h-20"
            value={form.notes}
            onChange={set("notes")}
            rows={3}
          />
        </Field>

        {save.error && (
          <p className="text-xs" style={{ color: "var(--color-err)" }}>
            {save.error instanceof Error ? save.error.message : String(save.error)}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            className="btn btn-brand"
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            <Icon name="check" size={14} />
            {save.isPending ? "שומר…" : "שמירה"}
          </button>
          {saved && (
            <span className="text-xs font-semibold" style={{ color: "var(--color-ok)" }}>
              נשמר
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
