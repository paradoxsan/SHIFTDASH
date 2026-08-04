"use client";

import { Suspense } from "react";
import { AnalyticsView } from "@/components/analytics/analytics-view";
import { Spinner } from "@/components/ui";

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <AnalyticsView />
    </Suspense>
  );
}
