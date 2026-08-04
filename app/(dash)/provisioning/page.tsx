"use client";

import { Suspense } from "react";
import { ProvisioningView } from "@/components/provisioning/provisioning-view";
import { Spinner } from "@/components/ui";

export default function ProvisioningPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ProvisioningView />
    </Suspense>
  );
}
