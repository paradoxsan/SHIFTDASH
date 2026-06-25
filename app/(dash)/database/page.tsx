"use client";

import { Suspense } from "react";
import { DbExplorer } from "@/components/database/db-explorer";
import { Spinner } from "@/components/ui";

export default function DatabasePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <DbExplorer />
    </Suspense>
  );
}
