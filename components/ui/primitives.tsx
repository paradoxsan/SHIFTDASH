import type { HealthState } from "@/lib/types";

export type Tone = "ok" | "warn" | "err" | "brand" | "ai" | "muted";

const TONE_COLOR: Record<Tone, string> = {
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  err: "var(--color-err)",
  brand: "var(--color-brand)",
  ai: "var(--color-ai)",
  muted: "var(--color-muted)",
};

const TONE_SOFT: Record<Tone, string> = {
  ok: "var(--color-ok-soft)",
  warn: "var(--color-warn-soft)",
  err: "var(--color-err-soft)",
  brand: "var(--color-brand-soft)",
  ai: "var(--color-ai-soft)",
  muted: "var(--color-surface-2)",
};

export function toneColor(tone: Tone): string {
  return TONE_COLOR[tone];
}

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({
  children,
  className = "",
  tone,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  /** Tints the border — use for cards that carry a status (an open alert, an overdue invoice). */
  tone?: Tone;
  as?: "div" | "section" | "article" | "li";
}) {
  const style = tone
    ? { borderColor: `color-mix(in srgb, ${TONE_COLOR[tone]} 40%, var(--color-border))` }
    : undefined;
  return (
    <Tag className={`card ${className}`} style={style}>
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
  right,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 p-4 pb-3">
      <div className="flex items-start gap-2.5 min-w-0">
        {icon && <div className="text-[var(--color-muted)] mt-0.5 shrink-0">{icon}</div>}
        <div className="min-w-0">
          <h2 className="font-bold leading-tight truncate">{title}</h2>
          {subtitle && (
            <p className="text-xs text-[var(--color-muted)] mt-1 line-clamp-2">{subtitle}</p>
          )}
        </div>
      </div>
      {right && <div className="shrink-0 flex items-center gap-2">{right}</div>}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
export function Badge({
  children,
  tone = "muted",
  solid,
}: {
  children: React.ReactNode;
  tone?: Tone;
  /** Filled background instead of just tinted text — for counts that must pop. */
  solid?: boolean;
}) {
  return (
    <span
      className="chip"
      style={
        solid
          ? {
              background: TONE_SOFT[tone],
              borderColor: `color-mix(in srgb, ${TONE_COLOR[tone]} 35%, transparent)`,
              color: TONE_COLOR[tone],
            }
          : { color: TONE_COLOR[tone] }
      }
    >
      {children}
    </span>
  );
}

export function StatusDot({ tone, pulse }: { tone: Tone; pulse?: boolean }) {
  return (
    <span className={`dot ${pulse ? "dot-live" : ""}`} style={{ background: TONE_COLOR[tone] }} />
  );
}

// ── Stat tile ─────────────────────────────────────────────────────────────────
export function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
  hint?: string;
}) {
  return (
    <div className="rounded-xl bg-[var(--color-surface-2)] px-3 py-2.5">
      <div className="text-[11px] text-[var(--color-muted)] mb-0.5 truncate">{label}</div>
      <div
        className="text-lg font-bold leading-none tnum"
        style={tone ? { color: TONE_COLOR[tone] } : undefined}
      >
        {value}
      </div>
      {hint && <div className="text-[10px] text-[var(--color-faint)] mt-1 truncate">{hint}</div>}
    </div>
  );
}

// ── Health dot (legacy API — still used by the old screens) ───────────────────
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
