"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

const ERRORS: Record<string, string> = {
  unauthorized: "המייל הזה לא מורשה להיכנס למערכת.",
  state: "תוקף ההתחברות פג — נסה שוב.",
  google: "שגיאת התחברות עם Google.",
  google_not_configured: "Google עדיין לא הוגדר. פנה למנהל המערכת.",
};

function LoginInner() {
  const sp = useSearchParams();
  const urlError = sp.get("error");

  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="card w-full max-w-sm p-7 text-center">
        <div className="flex items-center gap-2.5 mb-1 justify-center">
          <div className="w-9 h-9 rounded-xl bg-[var(--color-brand)] grid place-items-center text-white font-black">
            ב
          </div>
          <h1 className="text-xl font-extrabold">Bot Dashboard</h1>
        </div>
        <p className="text-sm text-[var(--color-muted)] mb-6">כניסה למשתמשים מורשים בלבד</p>

        {urlError && ERRORS[urlError] && (
          <p className="text-[var(--color-err)] text-sm mb-4">{ERRORS[urlError]}</p>
        )}

        <a href="/api/auth/google" className="btn btn-brand w-full justify-center gap-2">
          <span className="font-black bg-white rounded px-1.5 leading-none py-0.5" style={{ color: "#ea4335" }}>
            G
          </span>
          המשך עם Google
        </a>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
