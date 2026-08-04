---
name: digim-airtable-gantt
description: >-
  Fill a DIGIM / Shift Digital monthly content gantt in Airtable (the "Posts" table)
  from date-organized creative. For each date it writes one English Description, a
  Title of "DATE - פוסט/סטורי", a Scheduled Date at 08:00, attaches that date's
  images, and links the Client and Gantt Chart records. Use this WHENEVER the user
  wants to populate, fill, or build an Airtable content calendar / gantt for a client
  from dated assets — including "תמלא לי את הגאנט", "תכין גאנט באיירטייבל ל-X",
  "מלא את הטבלה באיירטייבל", "fill the Airtable gantt / content calendar", handing over
  a Google Drive folder split into date sub-folders, OR uploading the creative files
  directly into the chat. Trigger it even if they just paste a Drive link of dated
  content and say "build the gantt". It runs in short, checkpointed pulses and supports
  BOTH Google Drive folders AND direct file uploads.
---

# DIGIM Airtable Gantt Filler

Populate a client's monthly content gantt in Airtable from a set of creatives organized by date.
One Airtable row = one date. The deliverable is rows that a DIGIM designer can hand to the client.

This skill is built to run in **short pulses**: small, self-contained steps with a quick checkpoint
after each, so context stays light and the user can course-correct. Do **not** try to do the whole
month in one giant turn.

## What each row must contain

| Field | Rule |
|---|---|
| **Title** | `"<date> - פוסט"` or `"<date> - סטורי"` (e.g. `3.7 - פוסט`). Date matches the folder name. |
| **Description** | One per date, **English by default**. Capture format (post/carousel/story), the hook line, and the theme. Never one description per slide. |
| **Scheduled Date** | The folder's date at **08:00 local** (Israel `+03:00` unless told otherwise). |
| **Images** | All of that date's images, attached. |
| **Client** | Linked record — same for every row in the batch. |
| **Gantt Chart** | Linked record — same for every row in the batch. |
| **Status** | **Leave empty.** The client fills this, not us. |

Post vs story is decided by pixel size: **post = 1080×1450**, **story = 1080×1920** (vertical).
If the user quotes "1920×1080" they mean the vertical story — classify by which dimension is 1920.

## The two input modes

1. **Google Drive** — a shared folder with one sub-folder per date (`1.7`, `2.7`, …). Read directly.
2. **Direct uploads** — files dropped into the chat (`/mnt/user-data/uploads`). Airtable's attachment
   API needs a public URL, and a local file has none, so direct uploads must be **staged to Drive
   first** (see Phase 2B). This is the only reliable bridge with the available tools.

Detect the mode from how the user hands over the work; if both or neither is obvious, ask once.

---

## Workflow (one phase = one short pulse)

Read `references/airtable-reference.md` once at the start — it holds the known DIGIM base/table/field
IDs and the hard-won gotchas. Read `references/gotchas.md` before the first write.

### Phase 0 — Intake (one short message)

Confirm, pulling from context where possible (don't re-ask what you already know):
- **Client name** and **Gantt Chart name** (exact, as they appear in Airtable).
- **Base / table** — default to the DIGIM base in the reference; verify with `list_tables_for_base`.
- **Timezone & time** — default Israel `+03:00`, `08:00`.
- **Description language** — default English (the creative is usually English-first).
- **Input mode** — Drive folder link, or direct uploads.

### Phase 1 — Inventory & resolve links

1. **List the dates.**
   - Drive: `GDRIVE:search_files` with `query="parentId = '<folderId>'"`. Keep the date sub-folders
     (ignore grouping folders like `פוסטים` / `סטוריז` unless they ARE the dates).
   - Uploads: `view /mnt/user-data/uploads`; group files by date from sub-folders or filenames.
2. **Resolve the linked records** (this is where mistakes corrupt a live base, so confirm):
   - Client: `search_records` on the Clients table, `fields=["Client Name"]`, `query="<client>"`.
   - Gantt: `search_records` on the Gantts table, `fields=["Name"]`, `query="<gantt name tokens>"`.
   - `search_records` returns **only record IDs**, never values. If exactly one record matches, use it
     but tell the user to eyeball it. If several match, you can't read them to disambiguate — ask.
3. Show the user the date list + the resolved Client/Gantt IDs. Checkpoint: "look right?"

### Phase 2A — Read content from Drive, in batches of ~6 dates

For each date folder, `search_files` with `parentId`. **Use `contentSnippet` first** — Drive often OCRs
the on-image copy into it for free, which gives you the hook line without downloading anything.

Only **download images when you must** — i.e. the snippet is empty, or you need the pixel size to
classify post vs story. To read/inspect images:
1. `GDRIVE:download_file_content(fileId)` → it stores base64 to a `tool_results/*.json`.
2. `python scripts/decode_and_sheet.py decode` → decodes every pending download into `gantt_imgs/<id>.png`
   and prints each one's size + post/story classification.
3. `python scripts/decode_and_sheet.py sheet "<label>=<id>,<label>=<id>,..."` → builds ONE labeled
   contact sheet so you can `view` many dates at once instead of one image per turn.

Keep each pulse to ~6 dates: read → draft those descriptions → brief summary → next 6. Record per date:
`{date, type(post/story), description, [fileIds in slide order]}`.

### Phase 2B — Direct uploads: stage to Drive first

If the input is chat uploads, you still need public URLs for Airtable. Bridge it:
1. Ask the user for (or confirm) a **link-shared** Google Drive staging folder. You cannot change
   sharing yourself, so the folder must already be "anyone with the link".
2. For each local image, read its bytes, base64-encode, and `GDRIVE:create_file` with
   `parentId=<staging folder>`, `contentMimeType=image/png` (or jpeg), `disableConversionToGoogleType=true`.
   Collect the returned `fileId`.
3. Classify post/story straight from the local file size (`scripts/decode_and_sheet.py dims <path>`),
   and read the copy by viewing the local image directly.
4. From here the date now has Drive `fileId`s — proceed exactly like Drive mode.

### Phase 3 — Build the Airtable payload

Write a small spec file `spec.json` (see `scripts/build_records.py` header for the shape): the field IDs,
the Client/Gantt record IDs, tz/time/year, and the per-date items (`date`, `type`, `description`,
`images` as fileIds). Then:

```bash
python scripts/build_records.py spec.json
```

It emits `records_1.json`, `records_2.json`, … each a minified, ≤8-record array ready to paste into
`create_records_for_table`. It computes the Title, the `08:00 +03:00` ISO date, and the
`https://lh3.googleusercontent.com/d/<id>` image URLs for you — so you never hand-type a URL (that is
exactly how a `googleusercontent`→`googleusucontent` typo slips in and an image silently fails).

### Phase 4 — Write, test-row first

1. Create **one** row first (`records_1.json`'s first record) to confirm field IDs, the date display,
   the links, and that an image actually attaches. Use `typecast: true`.
2. If good, create the rest in batches (`create_records_for_table`, ≤50/req; the chunks are ≤8 so each
   paste stays copyable verbatim).
3. **Verify attachments ingested**: re-read one written record (or check the create response) — once
   Airtable has downloaded a Drive image, its URL changes to `v5.airtableusercontent.com` and gains
   `width/height/thumbnails`. If it's still an `lh3` URL with no dimensions after a moment, the file
   probably isn't link-shared — tell the user.

### Phase 5 — Close out

Summarize: rows created, post/story split, anything the user should eyeball (the Gantt link, any failed
image). Keep Status untouched.

---

## Defaults & judgment

- Descriptions: plain, concrete English. Lead with format + hook, then the theme/CTA. ~1–3 sentences.
- Don't fill Title with anything but `date - פוסט/סטורי` unless asked.
- Don't invent a Client or Gantt record. Link to existing ones; if you can't confirm, ask.
- Reuse `typecast: true` on writes — it lets linked records resolve by name as a fallback and is harmless.
- This is usually a **live client base**. Prefer one confirm over a wrong bulk write.

See `references/airtable-reference.md` for IDs + API field formats, and `references/gotchas.md` for the
specific failure modes this skill exists to avoid.
