// Campaign allowlist helper.
//
// A "campaign bot" (e.g. BRJewelry on its Click-to-WhatsApp number) runs on a
// real business/personal phone full of existing and personal chats. The n8n
// receiver only engages chats that arrived from the Meta ad (message.context.ad)
// and records them in the project's `campaign_contacts` table. The dashboard
// mirrors that: when a project has a campaign_contacts allowlist, the WhatsApp
// view shows ONLY those chats — the owner's personal/existing chats never reach
// the browser. Projects without the table (e.g. T-CENTER) are unaffected.
import { runSql, introspect, hasTable } from "./supabase-management";

/**
 * The set of chat_ids the campaign bot is allowed to talk to for this project,
 * or `null` when the project has no campaign allowlist (so callers should not
 * filter). Never throws — on any error it returns null (fail-open to "show all"
 * rather than hide everything).
 */
export async function campaignChatIds(ref: string): Promise<Set<string> | null> {
  try {
    const schema = await introspect(ref);
    if (!hasTable(schema, "campaign_contacts")) return null;
    const rows = await runSql<{ chat_id: string }>(
      ref,
      `select chat_id from campaign_contacts`
    );
    return new Set(rows.map((r) => r.chat_id).filter(Boolean));
  } catch {
    return null;
  }
}
