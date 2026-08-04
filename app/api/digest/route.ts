import { ok, fail } from "@/lib/api-helpers";
import { dailyDigest } from "@/lib/ai/digest";
import { todayInIsrael } from "@/lib/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cross-bot daily digest (cached one Claude call/day). Read-only to the caller.
export async function GET() {
  try {
    return ok(await dailyDigest(todayInIsrael()));
  } catch (e) {
    return fail(e);
  }
}
