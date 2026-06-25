"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const ERRORS: Record<string, string> = {
  unauthorized: "המייל הזה לא מורשה להיכנס למערכת.",
  state: "תוקף ההתחברות פג — נסה שוב.",
  google: "שגיאת התחברות עם Google.",
  google_not_configured: "Google עדיין לא הוגדר — אפשר להיכנס עם סיסמה.",
};

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const urlError = sp.get("error");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) {
      router.replace(sp.get("from") || "/");
      router.refresh();
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(data.error || "שגיאה בהתחברות");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="card w-full max-w-sm p-7">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-9 h-9 rounded-xl bg-[var(--color-brand)] grid place-items-center text-white font-black">
            ב
          </div>
          <h1 className="text-xl font-extrabold">Bot Dashboard</h1>
        </div>
        <p className="text-sm text-[var(--color-muted)] mb-6">מרכז השליטה לכל הבוטים שלך</p>

        {urlError && ERRORS[urlError] && (
          <p className="text-[var(--color-err)] text-sm mb-4">{ERRORS[urlError]}</p>
        )}

        <a href="/api/auth/google" className="btn w-full mb-4 gap-2">
          <span className="font-bold" style={{ color: "#ea4335" }}>
            G
          </span>
          המשך עם Google
        </a>

        <div className="flex items-center gap-2 my-4 text-[11px] text-[var(--color-muted)]">
          <div className="flex-1 h-px bg-[var(--color-border)]" />
          או סיסמה
          <div className="flex-1 h-px bg-[var(--color-border)]" />
        </div>

        <form onSubmit={onSubmit}>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="w-full rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] px-3.5 py-2.5 outline-none focus:border-[var(--color-brand)] transition"
            placeholder="••••••••"
          />
          {err && <p className="text-[var(--color-err)] text-sm mt-3">{err}</p>}
          <button type="submit" disabled={loading || !pw} className="btn btn-brand w-full mt-4">
            {loading ? "מתחבר…" : "כניסה עם סיסמה"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
