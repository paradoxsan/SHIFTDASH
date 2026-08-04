"use client";

export interface TabDef {
  id: string;
  label: string;
  /** Optional count shown as a badge — omit or 0 to hide. */
  count?: number;
  tone?: "err" | "warn" | "ok";
}

/** Controlled segmented tabs. Horizontally scrollable so a long tab row never
 *  forces the page to scroll sideways on mobile. */
export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1" role="tablist">
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
              on
                ? "bg-[var(--color-surface-3)] text-[var(--color-text)]"
                : "text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
            }`}
          >
            {t.label}
            {!!t.count && (
              <span
                className="text-[11px] font-bold tnum px-1.5 rounded-full"
                style={{
                  background: t.tone ? `var(--color-${t.tone}-soft)` : "var(--color-surface-2)",
                  color: t.tone ? `var(--color-${t.tone})` : "var(--color-muted)",
                }}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
