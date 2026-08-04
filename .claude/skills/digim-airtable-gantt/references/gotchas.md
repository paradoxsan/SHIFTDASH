# Gotchas — read before the first write

Each of these cost real time in practice. Scan them when planning, before importing, or when fixing.

## Airtable

- **`search_records` returns IDs only.** No field values come back. Don't try to "read" a row's content
  through it. Use `list_tables_for_base` / `get_table_schema` for structure; trust unique primary-field
  matches for linked records and confirm with the user.
- **Writes need field IDs, not names.** Passing `"Description"` as a key fails validation; pass `fld…`.
- **Client & Gantt Chart are linked records**, not text. Pass `["rec…"]`. With `typecast:true`, a bare
  string *name* will resolve to a matching record — or **create a duplicate** if it doesn't match
  exactly. Prefer passing the resolved record ID; only fall back to name with care.
- **Don't create duplicate Client/Gantt records.** Resolve the existing one first.
- **Status comes from the client.** Never set it.
- **Live client base.** One wrong bulk write is worse than one clarifying question. Test one row first.

## Dates

- Send an **offset-aware ISO** (`+03:00`), not a naive date, or the time can shift on display.
- It reads back as `Z` (UTC) — that's correct, not a bug: `08:00 +03:00` == `05:00Z`.

## Images / attachments

- Use `https://lh3.googleusercontent.com/d/<fileId>` for Drive. The folder must be link-shared.
- **Never hand-type the URL.** A single-character typo (`googleusercontent` → `googleusucontent`)
  is accepted by the API but the image silently never loads. Let `build_records.py` generate URLs.
- Airtable ingests attachments **async**. Verify by re-reading: a real ingest shows
  `v5.airtableusercontent.com` + `width/height/thumbnails`. Still `lh3` with no dims ⇒ likely not shared.
- Attachment writes **replace** the whole cell. To fix one image, re-send the full desired array.

## Google Drive

- List a folder: `search_files` with `query="parentId = '<id>'"`.
- **`contentSnippet` often contains the OCR'd on-image copy** — read it before downloading anything.
- `get_file_metadata` does **not** return image dimensions — you must download to get pixel size.
- `read_file_content` returns empty for these PNG/JPG creatives — don't rely on it; download + view.
- The download tool stores base64 in `tool_results/*.json`, nested: `result[0].text` is itself JSON
  whose `content` field is the base64. `decode_and_sheet.py` handles this.

## Pulses (the whole point)

- Work ~6 dates per pulse: read → draft → short summary → next batch. Don't front-load 60 downloads.
- Prefer one contact sheet (`sheet` command) over one `view` per image — saves turns and context.
- Keep write batches ≤8 records so each pasted payload stays copyable verbatim.
