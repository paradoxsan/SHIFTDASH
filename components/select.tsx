"use client";

export function BotSelect({
  bots,
  value,
  onChange,
}: {
  bots: { ref: string; name: string }[];
  value: string | null;
  onChange: (ref: string) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] px-3 py-2 text-sm font-semibold outline-none focus:border-[var(--color-brand)] max-w-[55vw] md:max-w-xs truncate"
    >
      {bots.length === 0 && <option value="">—</option>}
      {bots.map((b) => (
        <option key={b.ref} value={b.ref}>
          {b.name}
        </option>
      ))}
    </select>
  );
}
