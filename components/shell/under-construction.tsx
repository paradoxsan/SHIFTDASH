import { Icon } from "@/components/icons";

/** Honest placeholder for a screen whose build phase hasn't landed yet. Says
 *  what will live here so a half-built nav never looks broken. */
export function UnderConstruction({ what, phase }: { what: string; phase: string }) {
  return (
    <div className="card p-8 text-center">
      <div className="text-[var(--color-faint)] flex justify-center mb-3">
        <Icon name="system" size={26} />
      </div>
      <p className="text-sm text-[var(--color-muted)] max-w-md mx-auto">{what}</p>
      <p className="text-xs text-[var(--color-faint)] mt-3">נבנה ב{phase}</p>
    </div>
  );
}
