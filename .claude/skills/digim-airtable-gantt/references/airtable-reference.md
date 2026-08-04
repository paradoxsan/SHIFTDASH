# Airtable reference — DIGIM gantts base

Known IDs for the DIGIM content base (verify with `list_tables_for_base` before writing — schemas drift).

## Base & tables

- **Base**: `appN3iNAq9IaDawgB`
- **Posts** (the gantt rows): `tblwfx29mDkJzW3Sl`
- **Gantts**: `tblbHPfMJ9BRZoyJs` (primary field `Name` = `fldlhx3V38G9Ql6bB`)
- **Clients**: `tblVLUjp2LgAEDFMF` (primary field `Client Name` = `fld6vogBqooTmdlG2`)

## Posts table — field IDs

| Field | ID | Type | Notes |
|---|---|---|---|
| Title | `fldJqs5Y4vGrhd3DX` | singleLineText | `"<date> - פוסט/סטורי"` |
| Description | `fld0ynGJJ3kxa1jqx` | multilineText | English by default |
| Scheduled Date | `fldpONlUXK3H41Cc2` | dateTime | ISO with offset, e.g. `2026-07-01T08:00:00+03:00` |
| Status | `fldx5Y5aZNEFQYnrx` | singleSelect | **leave empty — client fills** |
| Gantt Chart | `fldJMlwR8eW0uXIN4` | multipleRecordLinks → Gantts | array of record IDs |
| Client | `fldcdUOgWRjOFBMK4` | multipleRecordLinks → Clients | array of record IDs |
| Images | `fldBtB4dKP6U4WRMa` | multipleAttachments | array of `{url, filename}` |

(There are other fields — `הצעה לפוסט` aiText, `Notes`, `photos to post`, etc. — leave them alone unless asked.)

## How to discover IDs in a different base

```
list_tables_for_base(baseId)            # → tables[].fields[] with id, name, type
get_table_schema(baseId, [{tableId, fieldIds:[...]}])   # detail for specific fields
```
`create_records_for_table` / `update_records_for_table` require **field IDs (`fld…`) as the keys** —
field *names* are rejected by the MCP wrapper. Always resolve IDs first.

## API field-value formats

- **dateTime**: ISO 8601 string. Send the offset so it lands on the right instant:
  `2026-07-03T08:00:00+03:00`. Airtable stores UTC (so it reads back as `...T05:00:00.000Z`) and
  displays it in the field's timezone (Israel → `8:00`). July in Israel is IDT = `+03:00`.
- **multipleRecordLinks** (Client, Gantt Chart): `["rec…"]` — an array of linked record IDs.
- **multipleAttachments** (Images): `[{ "url": "https://…", "filename": "1-7_1.png" }, …]`.
  Airtable downloads each URL server-side (anonymously) and re-hosts it. On a successful write the
  cell comes back with `v5.airtableusercontent.com` URLs plus `width/height/thumbnails`.

## Google Drive → Airtable image URLs

- Direct-content URL that Airtable ingests reliably: `https://lh3.googleusercontent.com/d/<fileId>`.
- The file must be shared **"anyone with the link"** (a `?usp=sharing` folder link is the signal).
  We do **not** change sharing permissions ourselves.
- `drive.google.com/uc?export=...` is flakier (can return an HTML interstitial) — prefer `lh3`.

## Reading records

`search_records` in this MCP returns **only `{id}` per record — no field values.** Consequences:
- You cannot read existing Description/Client/Gantt values to inspect them.
- To find a linked record's ID, search its own table on its primary field and trust a unique match
  (e.g. Clients `fields=["Client Name"]`, Gantts `fields=["Name"]`). Confirm with the user.
- Date / attachment fields are not full-text indexed, so they won't match in `search_records`.
