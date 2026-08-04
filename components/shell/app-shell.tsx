"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { NAV, isActiveHref } from "./nav";

function Brand() {
  return (
    <Link href="/today" className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-[var(--color-brand)] grid place-items-center text-white font-black text-sm shrink-0">
        S
      </div>
      <div className="leading-tight min-w-0">
        <div className="font-extrabold text-sm truncate">Shift Digital</div>
        <div className="text-[10px] text-[var(--color-faint)]">חדר בקרה</div>
      </div>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar — on the right, since the UI is RTL */}
      <aside className="hidden md:flex md:flex-col md:w-56 shrink-0 border-s border-[var(--color-border)] p-3 sticky top-0 h-dvh">
        <div className="px-1 py-1">
          <Brand />
        </div>

        <nav className="flex flex-col gap-0.5 mt-5">
          {NAV.map((it) => {
            const on = isActiveHref(pathname, it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${
                  on
                    ? "bg-[var(--color-surface-2)] text-[var(--color-text)]"
                    : "text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
                }`}
              >
                <Icon name={it.icon} size={18} />
                {it.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-3 space-y-0.5">
          <Link
            href="/ops"
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-[var(--color-faint)] hover:bg-[var(--color-surface)]"
          >
            <Icon name="back" size={14} />
            ממשק ישן
          </Link>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
          >
            <Icon name="logout" size={18} />
            יציאה
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-bg)_88%,transparent)] backdrop-blur">
        <Brand />
        <button onClick={logout} className="text-[var(--color-muted)] p-2" aria-label="יציאה">
          <Icon name="logout" size={18} />
        </button>
      </header>

      <main className="flex-1 min-w-0 pb-24 md:pb-6">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-6 border-t border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface)_95%,transparent)] backdrop-blur pb-[env(safe-area-inset-bottom)]">
        {NAV.map((it) => {
          const on = isActiveHref(pathname, it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition ${
                on ? "text-[var(--color-brand)]" : "text-[var(--color-muted)]"
              }`}
            >
              <Icon name={it.icon} size={19} />
              {it.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
