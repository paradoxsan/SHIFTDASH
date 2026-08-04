#!/usr/bin/env python3
"""
decode_and_sheet.py — helpers for reading creative images in short pulses.

Subcommands:
  decode
      Decode every pending Google-Drive download (base64 stored in
      $TOOL_RESULTS/GDRIVE_download_file_content_*.json) into ./gantt_imgs/<fileId>.png,
      then print each image's pixel size and post/story classification.

  sheet "1.7=<id>,2.7=<id>,..."
      Build ONE labeled contact sheet (./gantt_imgs/sheet.jpg) from already-decoded
      images, so you can `view` many dates in a single turn instead of one per turn.

  dims <path-or-fileId> [more ...]
      Print size + classification for local upload paths or decoded fileIds.

Classification: post = 1080x1450, story = 1080x1920 (vertical). Anything else -> "?".

Env:
  TOOL_RESULTS  (default /mnt/user-data/tool_results)
  IMG_DIR       (default ./gantt_imgs)
"""
import sys, os, json, base64, glob, math
from PIL import Image, ImageDraw, ImageFont

TOOL_RESULTS = os.environ.get("TOOL_RESULTS", "/mnt/user-data/tool_results")
IMG_DIR = os.environ.get("IMG_DIR", "gantt_imgs")
os.makedirs(IMG_DIR, exist_ok=True)


def classify(w, h):
    if (w, h) == (1080, 1450):
        return "POST"
    if (w, h) == (1080, 1920):
        return "STORY"
    # tolerate small variance / other aspect ratios
    if h > w and 1.2 < h / w < 1.45:
        return "POST?"
    if h > w and h / w >= 1.6:
        return "STORY?"
    return "?"


def _decode_one(path):
    """Drive download JSON is nested: result[0]['text'] is JSON with a base64 'content'."""
    data = json.load(open(path))
    elem = data[0] if isinstance(data, list) else data
    inner = json.loads(elem["text"]) if isinstance(elem, dict) and "text" in elem else elem
    fid = inner["id"]
    out = os.path.join(IMG_DIR, f"{fid}.png")
    if not os.path.exists(out):
        open(out, "wb").write(base64.b64decode(inner["content"]))
    return fid, inner.get("title", "")


def cmd_decode():
    rows = []
    for p in sorted(glob.glob(os.path.join(TOOL_RESULTS, "GDRIVE_download_file_content_*.json"))):
        try:
            fid, title = _decode_one(p)
            w, h = Image.open(os.path.join(IMG_DIR, f"{fid}.png")).size
            rows.append((fid, w, h, classify(w, h), title))
        except Exception as e:
            print(f"skip {os.path.basename(p)}: {e}", file=sys.stderr)
    for fid, w, h, kind, title in rows:
        print(f"{fid}  {w}x{h}  {kind}  {title}")
    print(f"total decoded available: {len(glob.glob(os.path.join(IMG_DIR,'*.png')))}", file=sys.stderr)


def cmd_sheet(spec):
    items = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        label, fid = part.split("=", 1)
        items.append((label.strip(), fid.strip()))
    cell, cols, lbl = 360, 4, 26
    rows = math.ceil(len(items) / cols) or 1
    sheet = Image.new("RGB", (cols * cell, rows * (cell + lbl)), (245, 245, 245))
    d = ImageDraw.Draw(sheet)
    try:
        f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
    except Exception:
        f = ImageFont.load_default()
    for i, (label, fid) in enumerate(items):
        p = os.path.join(IMG_DIR, f"{fid}.png")
        if not os.path.exists(p):
            print(f"missing {p} (decode first)", file=sys.stderr)
            continue
        im = Image.open(p).convert("RGB")
        im.thumbnail((cell, cell))
        r, c = divmod(i, cols)
        x, y = c * cell, r * (cell + lbl)
        d.rectangle([x, y, x + cell, y + lbl], fill=(20, 20, 20))
        d.text((x + 8, y + 2), label, fill=(255, 255, 255), font=f)
        sheet.paste(im, (x + (cell - im.width) // 2, y + lbl + (cell - im.height) // 2))
    out = os.path.join(IMG_DIR, "sheet.jpg")
    sheet.save(out, quality=82)
    print(out)


def cmd_dims(args):
    for a in args:
        p = a if os.path.exists(a) else os.path.join(IMG_DIR, f"{a}.png")
        try:
            w, h = Image.open(p).size
            print(f"{a}  {w}x{h}  {classify(w, h)}")
        except Exception as e:
            print(f"{a}  ERROR {e}", file=sys.stderr)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    cmd = sys.argv[1]
    if cmd == "decode":
        cmd_decode()
    elif cmd == "sheet":
        cmd_sheet(sys.argv[2])
    elif cmd == "dims":
        cmd_dims(sys.argv[2:])
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
