"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client";
import type { TableColumn } from "@/lib/types";
import { PageHeader, Spinner, ErrorBanner, EmptyState } from "@/components/ui";
import { useClientCtx } from "@/components/client-context";
import { formatNumber } from "@/lib/format";

interface RowsResponse {
  columns: TableColumn[];
  rows: Record<string, unknown>[];
  primaryKeys: string[];
}

export function DbExplorer() {
  const { activeClient } = useClientCtx();
  const ref = activeClient?.supabaseRef;
  const allowed = activeClient?.tables ?? [];
  const [table, setTable] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    setTable(null);
  }, [activeClient?.id]);

  const tablesQ = useQuery({
    queryKey: ["tables", ref],
    queryFn: () =>
      fetchJson<{ tables: { name: string; approxRows: number | null }[] }>(
        `/api/bots/${ref}/tables`
      ),
    enabled: !!ref,
  });

  const tables = (tablesQ.data?.tables ?? []).filter(
    (t) => allowed.length === 0 || allowed.includes(t.name)
  );

  useEffect(() => {
    if (table) return;
    if (tables.length) setTable(tables[0].name);
  }, [tables, table]);

  const rowsQ = useQuery({
    queryKey: ["rows", ref, table],
    queryFn: () => fetchJson<RowsResponse>(`/api/bots/${ref}/tables/${table}`),
    enabled: !!ref && !!table,
    refetchInterval: 15_000,
  });

  if (!activeClient) return <Spinner />;
  const cols = rowsQ.data?.columns ?? [];
  const pks = rowsQ.data?.primaryKeys ?? [];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <PageHeader
        title="דאטהבייס"
        subtitle={`${activeClient.name} · ${tables.length} טבלאות · לחיצה על שורה כדי לערוך`}
        live={rowsQ.isFetching}
      />

      {tablesQ.error && <ErrorBanner message={(tablesQ.error as Error).message} />}

      <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
        {tablesQ.isLoading ? (
          <Spinner />
        ) : (
          tables.map((t) => (
            <button
              key={t.name}
              onClick={() => setTable(t.name)}
              className="chip shrink-0"
              style={
                table === t.name
                  ? { borderColor: "var(--color-brand)", color: "var(--color-brand)" }
                  : undefined
              }
            >
              {t.name}
              <span className="opacity-60">{formatNumber(t.approxRows)}</span>
            </button>
          ))
        )}
      </div>

      {rowsQ.error && <ErrorBanner message={(rowsQ.error as Error).message} />}

      {rowsQ.isLoading ? (
        <Spinner />
      ) : !table ? (
        <EmptyState text="בחר טבלה" />
      ) : (rowsQ.data?.rows ?? []).length === 0 ? (
        <EmptyState text="אין שורות בטבלה" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm" dir="ltr">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th
                    key={c.name}
                    className="text-start font-semibold px-3 py-2 border-b border-[var(--color-border)] whitespace-nowrap text-[var(--color-muted)]"
                  >
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowsQ.data!.rows.map((r, i) => (
                <tr
                  key={i}
                  onClick={() => pks.length > 0 && setEditing(r)}
                  className={`border-b border-[var(--color-border)] ${
                    pks.length > 0 ? "cursor-pointer hover:bg-[var(--color-surface-2)]" : ""
                  }`}
                >
                  {cols.map((c) => (
                    <td
                      key={c.name}
                      className="px-3 py-2 whitespace-nowrap max-w-[280px] truncate align-top"
                    >
                      <Cell value={r[c.name]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && table && ref && (
        <EditModal
          dbRef={ref}
          table={table}
          columns={cols}
          primaryKeys={pks}
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            rowsQ.refetch();
          }}
        />
      )}
    </div>
  );
}

function EditModal({
  dbRef,
  table,
  columns,
  primaryKeys,
  row,
  onClose,
  onSaved,
}: {
  dbRef: string;
  table: string;
  columns: TableColumn[];
  primaryKeys: string[];
  row: Record<string, unknown>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(columns.map((c) => [c.name, row[c.name] == null ? "" : String(row[c.name])]))
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const set: Record<string, unknown> = {};
      for (const c of columns) {
        if (primaryKeys.includes(c.name)) continue;
        const original = row[c.name] == null ? "" : String(row[c.name]);
        if (draft[c.name] !== original) set[c.name] = draft[c.name] === "" ? null : draft[c.name];
      }
      if (Object.keys(set).length === 0) {
        onClose();
        return;
      }
      const pk = Object.fromEntries(primaryKeys.map((k) => [k, row[k]]));
      await fetchJson(`/api/bots/${dbRef}/tables/${table}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pk, set }),
      });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 bg-black/60 flex items-end md:items-center justify-center p-0 md:p-6"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg max-h-[85dvh] overflow-y-auto p-5 rounded-b-none md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-extrabold mb-1">עריכת שורה — {table}</h2>
        <p className="text-[11px] text-[var(--color-muted)] mb-4">
          מפתח: {primaryKeys.map((k) => `${k}=${row[k]}`).join(", ")}
        </p>

        <div className="flex flex-col gap-3">
          {columns.map((c) => {
            const isPk = primaryKeys.includes(c.name);
            return (
              <label key={c.name} className="block">
                <span className="text-xs font-semibold text-[var(--color-muted)]">
                  {c.name} <span className="opacity-50">{c.type}</span>
                  {isPk && " 🔒"}
                </span>
                <input
                  value={draft[c.name] ?? ""}
                  disabled={isPk}
                  onChange={(e) => setDraft((d) => ({ ...d, [c.name]: e.target.value }))}
                  dir="ltr"
                  className="w-full mt-1 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)] disabled:opacity-50"
                />
              </label>
            );
          })}
        </div>

        {err && <p className="text-[var(--color-err)] text-sm mt-3">{err}</p>}

        <div className="flex gap-2 mt-5 sticky bottom-0">
          <button onClick={save} disabled={saving} className="btn btn-brand flex-1">
            {saving ? "שומר…" : "שמור"}
          </button>
          <button onClick={onClose} className="btn">
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

function Cell({ value }: { value: unknown }) {
  if (value == null) return <span className="text-[var(--color-idle)]">null</span>;
  if (typeof value === "boolean") return <span>{value ? "true" : "false"}</span>;
  const s = typeof value === "object" ? JSON.stringify(value) : String(value);
  return <span title={s}>{s}</span>;
}
