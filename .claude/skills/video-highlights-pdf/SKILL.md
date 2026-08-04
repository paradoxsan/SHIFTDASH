---
name: video-highlights-pdf
description: Turn any uploaded video or audio (Facebook Live, council meetings, podcasts, interviews, lectures, client recordings) into a timestamped highlights report and a branded Shift Digital Hebrew RTL PDF. Supports two modes — speaker-focused (user gives a speaker name and optionally a photo; the report isolates that person's segments, key statements, and the message behind each) or general highlights for the whole video. Use this skill whenever the user uploads a video/audio file and asks for highlights, "היילייטס", "תוציא לי את הנושאים", "מה הוא אמר בלייב", "סיכום של הסרטון", clip timestamps, "חותמות זמן", quotes from a recording, or a highlights PDF — even if they only paste a Facebook/Instagram/YouTube link at first (the skill knows how to route that). Also use it when the user wants to find the best moments in a long recording for cutting Reels/clips.
---

# Video Highlights → Branded PDF

Pipeline: video/audio file → audio extraction → 10-minute chunks → Adobe `media_summarize` per chunk → timestamped highlights analysis (optionally speaker-focused) → Shift Digital branded Hebrew RTL PDF.

This skill encodes hard-won environment-specific workarounds. Follow the steps exactly — several "obvious" shortcuts fail in this sandbox.

## Step 0 — Intake

Establish three things (extract from conversation first, only ask what's missing):

1. **Source file.** Must be a local file in `/mnt/user-data/uploads/`.
   - Facebook / Instagram links **cannot be fetched** (robots disallowed). Ask the user to download the video and upload it to the chat.
   - YouTube links: either ask the user to download+upload, or offer Higgsfield `video_analysis_create` with `youtube_url` as an alternative path (scene-by-scene, different output format).
2. **Mode.** Speaker-focused (name + optional photo of the speaker) or general highlights. If the user names a person ("הלייב של X", "מה Y אמר"), default to speaker-focused. A photo helps the human verify clips later but does not change the audio analysis — say so honestly if the user provides one.
3. **Output language.** Default Hebrew (the PDF template is RTL). Match the user's language.

Probe the file before anything else:

```bash
ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_type,codec_name "<input>"
```

## Step 1 — Extract audio

Audio-only upload is ~5x smaller and `media_summarize` only needs speech:

```bash
ffmpeg -v error -i "<input>" -vn -acodec copy audio.m4a
```

If the audio codec is not AAC (copy fails), re-encode: `-acodec aac -b:a 96k`.
If the input is already audio, skip this step.

## Step 2 — Chunk into 10-minute segments

Timestamps come from chunk boundaries — `media_summarize` returns one summary per asset with **no internal timestamps**. Chunking is what makes the timeline possible.

- Duration ≤ 12 min → single file, no chunking (report will have no fine-grained timeline; tell the user).
- Otherwise → 10-minute chunks (600s), stream copy:

```bash
for i in 0 1 2 ...; do
  ffmpeg -v error -ss $((i*600)) -t 600 -i audio.m4a -acodec copy chunk_$i.m4a
done
```

Record the chunk→time-range mapping (chunk_0 = 0:00–10:00, chunk_1 = 10:00–20:00, ...). You will need it in Step 5.

## Step 3 — Upload chunks to Adobe (critical workarounds)

Read the Adobe init doc first: call `Adobe for creativity:adobe_mandatory_init` once per session before any Adobe tool.

Per chunk:

1. `asset_initialize_file_upload` with:
   - `file_size`: exact bytes (`wc -c < chunk_N.m4a`)
   - `media_type`: `audio/mp4`
   - `path`: a unique filename (e.g. `<project>_chunk_N.m4a`)
   - **`shorten_block_upload_urls: false` — MANDATORY.** Shortened URLs live on `at.adobe.com`, which the egress proxy **blocks** (`x-deny-reason: host_not_allowed`; only `*.adobe.io` is allowed). Non-shortened transfer URLs point to `acp-aep-cs-blobstore-*.adobe.io` and work.
2. PUT the bytes to the `rel/block/transfer` href:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" -L -X PUT "<transfer_href>" --data-binary @chunk_N.m4a
   ```
   Expect `200`. A `403` with `x-deny-reason: host_not_allowed` means you forgot `shorten_block_upload_urls: false`.
3. `asset_finalize_file_upload` — pass the **entire** transfer document back verbatim (every key, including `_links`). Save the returned `assetId` next to the chunk's time range.

Chunks are ~5MB each and fit in one block; no multi-block logic needed.

## Step 4 — Summarize each chunk (async widget flow)

Call `Adobe for creativity:media_summarize` once per `assetId`. You can fire all chunks in the same turn — each renders its own progress widget.

**Async rules (learned the hard way):**
- Do NOT call any poll tool. The widget polls itself.
- Results arrive one at a time: each completed widget sends a "media_summarize completed" message; call `read_widget_context` for `Adobe for creativity:media_summarize` to read **the most recently continued task only**.
- **Map every `taskId` to its chunk at submit time.** When a result arrives, match its `taskId` to know which time range it covers.
- Re-calling `media_summarize` on the same `assetId` starts a **new job** — there is no result cache. Never "retry to fetch".
- Between results, reply with a short collection checklist (✅/⬜ per segment with its time range) and ask the user to keep tapping the finished widgets. Hold the full report until all segments are in.

## Step 5 — Build the analysis

Once all chunk summaries are collected:

1. **Timeline.** Each summary is chronological within its chunk. Distribute its items across the chunk's 10 minutes to estimate sub-ranges (e.g. an item in the middle of chunk_3's summary ≈ ~34:00–36:00). State in the report that timestamps may drift by 1–2 minutes.
2. **Speaker mode.** Attribute segments to the named speaker using names mentioned in the summaries, who responds to whom, and context (e.g. the person streaming a live is usually the one making the recurring argument). Be honest in the report: attribution is inference from the audio, not voice ID.
3. **For each segment produce:** time range, topic, 3–7 key statements, and a one-line **message** ("המסר") — punchy, quotable, in the speaker's voice.
4. **Star (★) the strongest segments** and end with a ranked clip-recommendation list (by viral potential) — time range + one-line hook each.
5. **Quote honesty:** statements are faithful paraphrase from a summarization model, NOT verbatim transcription. The report must carry a warning box telling the user to verify wording against the video before burning subtitles. Never present them as exact quotes.

Deliver the analysis in chat first (the user usually wants to react), then build the PDF.

## Step 6 — Render the branded PDF

1. Install + font:
   ```bash
   pip install weasyprint pdf2image --break-system-packages -q
   ```
   Use the bundled Hebrew font at `assets/fonts/Heebo.ttf` (copy it next to your HTML). If missing, download: `curl -sL -o Heebo.ttf "https://raw.githubusercontent.com/google/fonts/main/ofl/heebo/Heebo%5Bwght%5D.ttf"`.
2. Copy `assets/report_template_example.html` (a complete, rendered example from a real job) into the working directory and rewrite its content sections for the current video. Keep the structure:
   - `SHIFT DIGITAL` brand header, H1 title, subtitle, meta line (duration, source, date)
   - Yellow warning box (paraphrase + timestamp-drift disclaimer)
   - "חוט מקשר" overview paragraph
   - One `.section` per segment: black `.timestamp` pill + ★ for top segments + bullets + blue `.message` box
   - Closing black `.clips` block with the ranked clip recommendations
   - RTL throughout (`dir="rtl"`), font-family `Heebo`, fix the `@font-face` URL to your local copy.
3. Render and verify:
   ```bash
   python3 -m weasyprint report.html /mnt/user-data/outputs/<name>-highlights.pdf
   ```
   Rasterize page 1 with `pdf2image` and **view it** — confirm Hebrew renders RTL with no tofu boxes and the layout is clean. Fix and re-render if not.
4. `present_files` the PDF with a one-paragraph summary. No long postamble.

## Failure modes & fallbacks

- `web_fetch` on facebook.com → `ROBOTS_DISALLOWED`. Expected; route to manual download.
- Adobe PUT returns 403 `host_not_allowed` → re-init the upload with `shorten_block_upload_urls: false`.
- A summarize job stalls past ~10 min → submit a fresh `media_summarize` for that chunk only (new job) and update the taskId map.
- Hebrew renders as boxes in the PDF → the `@font-face` path is wrong or the font didn't load; verify `Heebo.ttf` exists next to the HTML.
- Very long videos (>90 min): warn the user the run involves many widgets to tap; consider 15-minute chunks to reduce round trips at the cost of timestamp precision.
