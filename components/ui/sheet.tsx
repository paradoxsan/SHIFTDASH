"use client";

import { useEffect } from "react";
import { Icon } from "@/components/icons";

/** Side drawer. In RTL the sheet slides in from the left (the "end" side), and
 *  full-width on mobile. Escape and backdrop both close it. */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Lock background scroll while the sheet is up.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <button
        aria-label="סגור"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
      />
      <div
        className={`relative ms-auto h-full w-full ${width} bg-[var(--color-surface)] border-s border-[var(--color-border)] flex flex-col animate-in`}
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-[var(--color-border)]">
          <div className="min-w-0">
            <h2 className="font-extrabold text-lg leading-tight truncate">{title}</h2>
            {subtitle && (
              <p className="text-xs text-[var(--color-muted)] mt-1 truncate">{subtitle}</p>
            )}
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm" aria-label="סגור">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">{children}</div>

        {footer && (
          <div className="p-4 border-t border-[var(--color-border)] flex gap-2 justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
