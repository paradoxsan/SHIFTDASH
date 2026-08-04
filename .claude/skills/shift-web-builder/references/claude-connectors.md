# Claude Connectors — Making the Site Live Through Integrations (Model-Agnostic)

This skill runs on any Claude model. Capabilities differ per session (which connectors are
authorized, whether web search exists, whether there's a code sandbox). The rule: **detect, use,
degrade gracefully** — never fake a tool call, never block delivery because an integration is
missing; deliver the site plus a wiring spec instead.

## 0. Detection etiquette

At Phase 6, check which of the tools below actually exist in the current session's tool list.
If a needed one is missing, tell the user in one line what connecting it would unlock
("אם תחבר Supabase אני יכול לחבר את הטופס לדאטהבייס אמיתי") and continue with the fallback.
Never call a tool you don't see. Other models reading this: the same applies to you — the spec
fallbacks below are always sufficient for a complete deliverable.

## 1. Forms & data — Supabase

Best route for live lead forms behind a landing page.
- Use the Supabase MCP tools: create/verify a `leads` table (typical: id, created_at, name,
  phone, message, source, utm fields), then wire the form via REST insert from the page
  (anon key + RLS insert-only policy).
- Hebrew data: columns store UTF-8 fine; keep column NAMES in English.
- **Fallback (no Supabase):** form posts to a documented webhook URL placeholder
  (`https://YOUR-N8N/webhook/lead`) with a clear TODO comment + a wiring spec in the delivery
  notes. Alternative zero-backend: WhatsApp deep link with prefilled text
  (`https://wa.me/972XXXXXXXXX?text=...` — URL-encode the Hebrew).

## 2. Lead automation — n8n

Daniel's stack routes leads through n8n (Green API → WhatsApp, Sheets-CRM, calendar booking).
- If n8n MCP tools are present: create/extend a workflow — Webhook trigger → validation →
  Google Sheets/CRM append → WhatsApp notification to the owner. Respect existing patterns
  (the CRM sheet's real headers may not be on row 1 — verify before appending).
- The site's form `action`/fetch target is the n8n webhook URL; include UTM passthrough.
- **Fallback:** generate the importable n8n workflow JSON via the `n8n-workflow-builder` skill
  conventions (placeholder credentials) and attach it to the delivery.

## 3. Visual assets — Higgsfield / Adobe / image search

- **Higgsfield MCP (image generation):** hero/section visuals when the client lacks photography.
  Product/commercial: marketing-studio image; people/UGC feel: soul models; complex composites:
  GPT Image 2 tends to beat Nano Banana Pro. Reference elements use `<<<element-id>>>` in
  prompts. Remember uploads from the sandbox may be blocked — ask the user to upload media in
  chat when needed.
- **Adobe MCP:** background removal, crops/resizes to exact section dimensions, vectorize for
  logo cleanup.
- **image_search:** reference/mood only — never embed found images in a client deliverable
  (rights). Generated or client-supplied images only.
- **Fallback:** build with disciplined placeholders — solid/gradient blocks sized correctly with
  Hebrew TODO captions ("כאן: תמונת הצוות, רוחב מלא, 1600×900") so the client sees exactly what
  to shoot.

## 4. Content & brand inputs — Google Drive / past chats

- Google Drive search for brand books, logos, price lists, old proposals before asking the
  client for them.
- `conversation_search`/`recent_chats` for prior work with this client (quotes, reels concepts,
  brand decisions) — reuse established brand decisions instead of re-inventing.

## 5. Analytics & pixels (spec-only, always)

Landing pages for paid traffic need: Meta Pixel + Google tag stubs with clearly marked IDs to
fill, a `lead` event fired on successful form submit / WhatsApp click, and UTM capture into
hidden form fields. Include commented stubs in the HTML — wiring real IDs is a client/agency
step; say so in delivery notes.

## 6. Handoff spec template (include whenever any integration is mocked)

```
חיבורים להשלמה:
1. טופס → [n8n webhook / Supabase] — כתובת: [TODO], שדות: name, phone, source, utm_*
2. פיקסל מטא: להחליף PIXEL_ID בשורה X · גוגל: GA4_ID בשורה Y
3. וואטסאפ: להחליף את המספר ב-wa.me בכל הכפתורים (חיפוש: 972XXXXXXXXX)
4. תמונות: רשימת הפלייסהולדרים + מידות מדויקות
```
