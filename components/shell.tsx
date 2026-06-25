"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "./icons";

const ITEMS = [
  { href: "/", label: "סקירה", icon: "overview" },
  { href: "/crm", label: "CRM", icon: "crm" },
  { href: "/workflows", label: "אוטומציות", icon: "workflows" },
  { href: "/executions", label: "ריצות", icon: "executions" },
  { href: "/chat", label: "וואטסאפ", icon: "chat" },
  { href: "/database", label: "דאטהבייס", icon: "database" },
];

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-lg bg-[var(--color-brand)] grid place-items-center text-white font-black">
        ב
      </div>
      <span className="font-extrabold">Bot Dashboard</span>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar (right side in RTL) */}
      <aside className="hidden md:flex md:flex-col md:w-60 shrink-0 border-l border-[var(--color-border)] p-3 sticky top-0 h-dvh">
        <Brand />
        <nav className="flex flex-col gap-1 mt-5">
          {ITEMS.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${
                isActive(it.href)
                  ? "bg-[var(--color-surface-2)] text-white"
                  : "text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
              }`}
            >
              <Icon name={it.icon} />
              {it.label}
            </Link>
          ))}
        </nav>
        <button
          onClick={logout}
          className="mt-auto flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
        >
          <Icon name="logout" />
          יציאה
        </button>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-20 flex items-center justify-between px-4 h-14 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-bg)_88%,transparent)] backdrop-blur">
        <Brand />
        <button onClick={logout} className="text-[var(--color-muted)] p-2" aria-label="יציאה">
          <Icon name="logout" />
        </button>
      </header>

      <main className="flex-1 min-w-0 pb-24 md:pb-6">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 grid grid-cols-6 border-t border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface)_95%,transparent)] backdrop-blur pb-[env(safe-area-inset-bottom)]">
        {ITEMS.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition ${
              isActive(it.href) ? "text-[var(--color-brand)]" : "text-[var(--color-muted)]"
            }`}
          >
            <Icon name={it.icon} size={20} />
            {it.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
