#!/usr/bin/env python3
"""
build_records.py — turn a small spec into ready-to-paste Airtable create-records payloads.

Why this exists: it computes the Title, the offset-aware ISO date, and the Drive image URLs
so you never hand-type a URL (a one-char typo is accepted by the API but the image silently
never loads). Output is split into <=8-record chunks so each pasted payload stays copyable.

Usage:
    python build_records.py spec.json
    # writes records_1.json, records_2.json, ... (minified single-line arrays)

spec.json shape:
{
  "fields": {                      # field IDs from references/airtable-reference.md
    "title":       "fldJqs5Y4vGrhd3DX",
    "description": "fld0ynGJJ3kxa1jqx",
    "date":        "fldpONlUXK3H41Cc2",
    "client":      "fldcdUOgWRjOFBMK4",
    "gantt":       "fldJMlwR8eW0uXIN4",
    "images":      "fldBtB4dKP6U4WRMa"
  },
  "client_rec": "recBAhiBeyPZy5Esx",
  "gantt_rec":  "rectipwFwAOGD6zua",
  "year":  2026,
  "tz":    "+03:00",               # optional, default +03:00
  "time":  "08:00",                # optional, default 08:00
  "type_labels": {"post": "פוסט", "story": "סטורי"},   # optional
  "image_url_tpl": "https://lh3.googleusercontent.com/d/{id}",  # optional
  "chunk_size": 8,                 # optional
  "items": [
    {"date": "1.7",  "type": "post",  "description": "…", "images": ["fileId1","fileId2"]},
    {"date": "2.7",  "type": "story", "description": "…", "images": ["fileId3"]}
  ]
}

Notes:
- "date" is "D.M" (day.month); month/day are taken from it, year from spec.year.
- "images" are Google-Drive fileIds (Drive mode, or uploads already staged to Drive).
- Title becomes "<date> - <type label>".
"""
import sys, json, os


def iso(date, year, time, tz):
    d, m = date.split(".")
    return f"{int(year):04d}-{int(m):02d}-{int(d):02d}T{time}:00{tz}"


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    spec = json.load(open(sys.argv[1]))
    F = spec["fields"]
    tz = spec.get("tz", "+03:00")
    tm = spec.get("time", "08:00")
    year = spec["year"]
    labels = spec.get("type_labels", {"post": "פוסט", "story": "סטורי"})
    tpl = spec.get("image_url_tpl", "https://lh3.googleusercontent.com/d/{id}")
    chunk = int(spec.get("chunk_size", 8))
    client_rec = spec["client_rec"]
    gantt_rec = spec["gantt_rec"]

    records = []
    for it in spec["items"]:
        date = it["date"]
        typ = it["type"].lower()
        label = labels.get(typ, typ)
        dnorm = date.replace(".", "-")
        imgs = [
            {"filename": f"{dnorm}_{i+1}.png", "url": tpl.format(id=fid)}
            for i, fid in enumerate(it["images"])
        ]
        records.append({"fields": {
            F["title"]: f"{date} - {label}",
            F["description"]: it["description"],
            F["date"]: iso(date, year, tm, tz),
            F["client"]: [client_rec],
            F["gantt"]: [gantt_rec],
            F["images"]: imgs,
        }})

    n = 0
    for i in range(0, len(records), chunk):
        n += 1
        out = f"records_{n}.json"
        with open(out, "w") as fh:
            json.dump(records[i:i + chunk], fh, ensure_ascii=False)
        print(f"{out}  ({len(records[i:i+chunk])} records)")
    print(f"total records: {len(records)} in {n} file(s)", file=sys.stderr)


if __name__ == "__main__":
    main()
