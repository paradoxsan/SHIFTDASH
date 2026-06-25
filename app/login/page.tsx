"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      <form onSubmit={onSubmit} className="card w-full max-w-sm p-7">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-9 h-9 rounded-xl bg-[var(--color-brand)] grid place-items-center text-white font-black">
            ב
          </div>
          <h1 className="text-xl font-extrabold">Bot Dashboard</h1>
        </div>
        <p className="text-sm text-[var(--color-muted)] mb-6">מרכז השליטה לכל הבוטים שלך</p>

        <label className="block text-sm font-semibold mb-2">סיסמה</label>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoFocus
          className="w-full rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] px-3.5 py-2.5 outline-none focus:border-[var(--color-brand)] transition"
          placeholder="••••••••"
        />
        {err && <p className="text-[var(--color-err)] text-sm mt-3">{err}</p>}

        <button type="submit" disabled={loading || !pw} className="btn btn-brand w-full mt-5">
          {loading ? "מתחבר…" : "כניסה"}
        </button>
      </form>
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
