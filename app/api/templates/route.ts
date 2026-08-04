import { ok, fail } from "@/lib/api-helpers";
import { listBotTemplates } from "@/lib/control-plane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List registered bot templates (manifest only — never secret values). Read-only.
export async function GET() {
  try {
    return ok({ templates: await listBotTemplates() });
  } catch (e) {
    return fail(e);
  }
}
