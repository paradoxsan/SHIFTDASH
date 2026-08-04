import { redirect } from "next/navigation";

// The old client-metrics overview is superseded by the new "היום" screen. The
// remaining app/(dash) screens stay reachable at their own paths until the new
// interface replaces each of them.
export default function LegacyOverviewPage() {
  redirect("/today");
}
