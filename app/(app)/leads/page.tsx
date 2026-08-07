import { LeadManager } from "@/components/leads/lead-manager";

// The Sheet-backed LeadManager already owns its header, tabs and layout, and it
// was migrated onto the new UI primitives during phase 0 — so this screen is the
// component, not a re-implementation of it. The old /crm route reached it only
// when the "mine" workspace happened to be selected; here it has its own slot,
// which is what it always was: Shift Digital's own pipeline, not a client's.
export default function LeadsPage() {
  return <LeadManager />;
}
