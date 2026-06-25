"use client";

import type { HealthState } from "@/lib/types";

export function PageHeader({
  title,
  subtitle,
  live,
  right,
}: {
  title: string;
  subtitle?: string;
  live?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-[var(--color-muted)] mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {right}
        {live !== undefined && (
          <span
            className="chip"
            style={{ color: live ? "var(--color-ok)" : "var(--color-muted)" }}
          >
            <span
              className={`dot ${live ? "dot-live" : ""}`}
              style={{ background: live ? "var(--color-ok)" : "var(--color-idle)" }}
            />
            {live ? "חי" : "מעודכן"}
          </span>
        )}
      </div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-[var(--color-muted)] text-sm py-12 justify-center">
      <span className="dot dot-live" style={{ background: "var(--color-brand)" }} />
      {label ?? "טוען…"}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="card p-4 text-sm mb-4"
      style={{ borderColor: "color-mix(in srgb, var(--color-err) 45%, var(--color-border))" }}
    >
      <span style={{ color: "var(--color-err)" }} className="font-bold">
        שגיאה:{" "}
      </span>
      {message}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center text-sm text-[var(--color-muted)] py-12">{text}</div>
  );
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "ok" | "warn" | "err" | "brand";
}) {
  const color = tone ? `var(--color-${tone})` : undefined;
  return (
    <div className="rounded-xl bg-[var(--color-surface-2)] px-3 py-2.5">
      <div className="text-[11px] text-[var(--color-muted)] mb-0.5">{label}</div>
      <div className="text-lg font-bold leading-none" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

export const HEALTH_META: Record<HealthState, { label: string; color: string; pulse: boolean }> = {
  live: { label: "פעיל", color: "var(--color-ok)", pulse: true },
  idle: { label: "שקט היום", color: "var(--color-brand)", pulse: false },
  stale: { label: "לא פעיל", color: "var(--color-warn)", pulse: false },
  unknown: { label: "לא ידוע", color: "var(--color-idle)", pulse: false },
};

export function HealthDot({ state }: { state: HealthState }) {
  const m = HEALTH_META[state];
  return <span className={`dot ${m.pulse ? "dot-live" : ""}`} style={{ background: m.color }} />;
}
