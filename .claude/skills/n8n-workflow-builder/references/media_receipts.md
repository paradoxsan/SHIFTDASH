# Media classification, Vision, and receipt→order matching

Hard-won from the T-CENTER build cycle. This is the playbook for a WhatsApp sales bot that must tell
**artwork/mockups (גרפיקה/הדמיה)** apart from **proof-of-payment screenshots (אסמכתא)**, extract the
payer name + amount from a receipt, and mark the right order paid — safely.

The architecture has three independent safety layers. A false "paid" requires **all three** to fail:

1. **Keyword routing** (asymmetric) — decides graphic vs receipt vs "ask Vision" from caption/filename.
2. **Vision by structure + confidence** — looks at the *image layout*, not the text on it.
3. **name+amount match against an open order** — the DB backstop; auto-pays only on a full match.

---

## §1 — Keyword routing must be asymmetric (graphic words win, receipt needs a STRONG signal)

A symmetric keyword test ("does the caption contain a payment word?") mislabels designs as receipts:
a customer writes "הדמיה לחולצה, **שילמתי** כבר", or sends `invoice_design.png`, and the bot routes a
*graphic* into the *paid* pipeline.

Rules:
- **Explicit graphic words win outright** → `graphic` (הדמיה/גרפיקה/עיצוב/לוגו/קדמי/אחורי/חזית/גב/הדפס/חולצה/דרייפיט/קפוצ).
- **Receipt requires a STRONG signal** — words specific to proof-of-payment and unlikely in a design
  caption: אסמכתא / אישור תשלום / תשלום בוצע / צילום העברה / העברה בנקאית / קבלה על / ביט / paybox /
  proof of payment / payment confirmation.
- **WEAK signals alone don't decide** — העברה / שולם / שילמתי / transfer / paid / invoice / receipt /
  חשבונית appear in normal chat too. Weak-only on an image → **defer to Vision**.
- **Conflict (graphic word + strong receipt word)** → defer to Vision.
- A captionless **document/PDF** → `graphic` (artwork is usually a PDF; never `receipt` without Vision).

`Classify Media` Code node (keyword stage):

```js
const j = $('Extract Media').item.json;
const text = ((j.caption||'') + ' ' + (j.filename||'')).toLowerCase();

const RECEIPT_STRONG = /(אסמכת|אסמכתא|אסמכתה|אישור תשלום|תשלום בוצע|צילום העברה|העברה בנקאית|קבלה על|ביט|bit\b|paybox|פייבוקס|proof of payment|payment confirmation)/i;
const RECEIPT_WEAK   = /(העברה|שולם|שילמתי|transfer|paid|invoice|receipt|חשבונית|confirmation)/i;
const GRAPHIC        = /(גרפיק|הדמי|הדמיה|עיצוב|לוגו|דמו|mockup|design|logo|קדמ|אחור|חזית|גב|הדפס|print|artwork|דרייפיט|חולצה|חולצות|קפוצ)/i;

const hasGraphic = GRAPHIC.test(text), hasStrong = RECEIPT_STRONG.test(text), hasWeak = RECEIPT_WEAK.test(text);
let kind = '', needsVision = false;
if (hasGraphic && !hasStrong)      kind = 'graphic';
else if (hasStrong && !hasGraphic) kind = 'receipt';
else if (hasStrong && hasGraphic)  { kind = ''; needsVision = (j.type === 'image'); }
else if (hasWeak && !hasGraphic)   { kind = ''; needsVision = (j.type === 'image'); }
if (!kind && !needsVision) { if (j.type === 'image') needsVision = true; else kind = 'graphic'; }
if (!kind && needsVision === false) kind = 'graphic';
return [{ json: { ...j, kind, needsVision, rcpt_name: '', rcpt_amount: 0 } }];
```

`Extract Media` should surface `caption`, `hasCaption`, `mediaId`, `mime`, `filename`, `link`,
`chatId`, `phone` (= `chatId.split('@')[0]`), and `senderName` (`from_name`) so the whole media path
can read them.

---

## §2 — Vision classifies by STRUCTURE, not by the text printed on the image

The decisive failure case: a shirt design that prints "שילמתי 65 שקל" and a phone number. A
text-reading classifier extracts a fake amount/name. The fix is to make Vision judge the **visual
layout**:

- **Real asmachta** = looks like a *bank/app document*: ordered fields (מס׳ אסמכתא, שם המוטב, סכום,
  מועד ביצוע), bank/app logo, uniform/white background, system text.
- **Graphic** = looks like *artwork*: illustration, artistic typography, color composition, shirt
  layout — **even if it contains a number or the word "שילמתי" or a phone number**.
- Instruct: "if there is payment-like text but the structure is a design/illustration/shirt → it's a
  graphic." And "if unsure it's a real payment screenshot → classify as graphic."

Return structured JSON **with a confidence score** (0–100 = how sure it's a *real* payment doc):

```
{"kind":"receipt"|"graphic","confidence":<0-100>,"full_name":"<payer or empty>","amount":<number or 0>}
```

Parse, then **demote low-confidence receipts**: `if (kind==='receipt' && confidence < 55) kind='graphic'`.
A real bank screenshot scores high; a shirt design scores low.

This pairs with §3 (how to actually get the image to Gemini) and §6 (the DB backstop). Even a
confident false `receipt` still has to match an open order's name **and** amount to ever mark paid —
a stray "65" on a design won't.

> Model note: `gemini-3.1-flash-lite` (current valid model; Firebase docs recommend it as the
> migration target) is cheap/fast but small. The structure prompt + confidence gate + DB match make
> it reliable enough. For maximum precision a Pro-Vision model is an option (slower, costlier);
> usually unnecessary given the three layers.

---

## §3 — Gemini Vision `400 Unable to process input image`: mime↔bytes, and pre-built body

This 400 means Gemini **received bytes it couldn't decode**, not that the request was malformed. Two
root causes, both fixed in the download Code node:

1. **mime↔bytes mismatch.** WhatsApp re-encodes images to **WebP**, but the WHAPI message object (or
   your `|| 'image/jpeg'` default) may report JPEG. WebP bytes labeled `image/jpeg` → 400. **Sniff
   the real type from the byte signature** and send the matching `mimeType`. Only send what Gemini
   supports: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`.
2. **Expression mangling.** n8n's `={{ { … } }}` object expression can corrupt a very long base64
   string. **Build the whole request body in the Code node** and pass it as `={{ $json.geminiBody }}`.

Also: use camelCase `inlineData`/`mimeType` (v1beta), strip any `data:` prefix, and **guard with an
`IF vision_ok`** so a non-image (an HTML/JSON error page from an expired `link`, or a PDF) never hits
Gemini.

`Vision: Fetch & B64` (Code node — downloads, validates, pre-builds the body):

```js
const j = $('Classify Media').item.json;
const token = $env.WHAPI_TOKEN;               // keep the channel token in env, not inline

function sniffMime(b){
  if (!b || b.length < 12) return '';
  if (b[0]===0xFF&&b[1]===0xD8&&b[2]===0xFF) return 'image/jpeg';
  if (b[0]===0x89&&b[1]===0x50&&b[2]===0x4E&&b[3]===0x47) return 'image/png';
  if (b[0]===0x47&&b[1]===0x49&&b[2]===0x46&&b[3]===0x38) return 'image/gif';
  if (b[0]===0x52&&b[1]===0x49&&b[2]===0x46&&b[3]===0x46&&b[8]===0x57&&b[9]===0x45&&b[10]===0x42&&b[11]===0x50) return 'image/webp';
  if (b[0]===0x25&&b[1]===0x50&&b[2]===0x44&&b[3]===0x46) return 'application/pdf';
  if (b[4]===0x66&&b[5]===0x74&&b[6]===0x79&&b[7]===0x70) return 'image/heic';
  return '';
}
const GEMINI_OK = ['image/jpeg','image/png','image/webp','image/heic','image/heif'];

let b64='', mime='', ok=false, debug='';
try {
  // GET /media/{id} is the reliable raw-file route; fall back to the link.
  let url = j.mediaId ? ('https://gate.whapi.cloud/media/' + j.mediaId) : j.link;
  let resp = await this.helpers.httpRequest({ method:'GET', url, encoding:'arraybuffer',
    headers: token ? { Authorization:'Bearer '+token } : {}, returnFullResponse:true });
  let buf = Buffer.isBuffer(resp.body) ? resp.body : Buffer.from(resp.body);
  if ((!buf || buf.length < 100) && j.link) {
    resp = await this.helpers.httpRequest({ method:'GET', url:j.link, encoding:'arraybuffer',
      headers: token ? { Authorization:'Bearer '+token } : {}, returnFullResponse:true });
    buf = Buffer.isBuffer(resp.body) ? resp.body : Buffer.from(resp.body);
  }
  const sniffed = sniffMime(buf);
  debug = 'len='+(buf?buf.length:0)+' sniff='+(sniffed||'none')+' head='+buf.slice(0,16).toString('utf8').replace(/[^\x20-\x7e]/g,'.');
  if (sniffed && GEMINI_OK.includes(sniffed)) {
    mime = sniffed;
    b64 = buf.toString('base64').replace(/^data:[^;]+;base64,/, '');
    ok = b64.length > 0;
  } else { ok = false; mime = sniffed || ''; }
} catch (e) { debug = 'fetch_error='+(e.message||e); ok = false; }

const promptText = 'אתה מסווג תמונה שלקוח שלח לעסק הדפסת חולצות. הבדל בין אסמכתת תשלום אמיתית (צילום מסך של בנק/ביט/העברה — שדות מסודרים, לוגו, מבנה מסמך) לבין גרפיקה/הדמיה להדפסה (איור/עיצוב/חולצה), גם אם בגרפיקה כתוב מספר או מילה כמו שילמתי. אם אינך בטוח שזו אסמכתא אמיתית — graphic. החזר JSON אחד: {"kind":"receipt"|"graphic","confidence":<0-100>,"full_name":"<אם אסמכתא>","amount":<אם אסמכתא, אחרת 0>}.';

const geminiBody = ok ? {
  contents: [ { role:'user', parts: [
    { text: promptText },
    { inlineData: { mimeType: mime, data: b64 } }
  ] } ],
  generationConfig: { temperature: 0, maxOutputTokens: 512, responseMimeType: 'application/json' }
} : null;

return [{ json: { ...j, vision_b64:b64, vision_mime: mime||'image/jpeg', vision_ok:ok, vision_debug:debug, geminiBody } }];
```

> **Don't starve `maxOutputTokens` — a tight cap silently truncates the JSON and you get `amount=0`.**
> A real T-CENTER bug (V2.6→2.7): with `maxOutputTokens: 80`, a Hebrew payer name + the `{…}` JSON
> easily ran past 80 tokens, Gemini returned a **half-written JSON** object, `Vision: Parse Kind`'s
> `JSON.parse` threw, the `catch` fell back to `graphic`/`amount=0`, and the asmachta **looked
> ignored** — name and amount both came back empty even though the image and the model were fine.
> The tell is in `Vision: Parse Kind`'s input: `candidates[0].content.parts[0].text` ends mid-object
> (no closing `}`). Fixes, all three: bump to **`maxOutputTokens: 512`**, set
> **`responseMimeType: 'application/json'`** (the model then emits clean JSON, no markdown fence to
> strip and far less truncation risk), and make the parse **coerce the amount hard** rather than
> trusting `Number(o.amount)` — Gemini sometimes returns `"100.00"` or `"₪100"`:
> `amount = Number(String(o.amount ?? 0).replace(/[^0-9.]/g,'')) || 0;`. Add a `vision_parse_debug`
> field carrying `raw=<first 180 chars>` so the next failure is one glance, not a re-run.

> **A single quote inside a Hebrew prompt string breaks the whole Code node — `SyntaxError:
> Unexpected identifier`.** The prompt is a JS string delimited by `'…'`. The moment you put a Hebrew
> field label in single quotes inside it — `'שם המוטב'`, `'מחשבון'`, `'סכום'`, or even an apostrophe
> in copy — that inner `'` **closes the string early** and n8n throws `Unexpected identifier 'שם'`
> (real T-CENTER V2.7 break: editing the prompt to reference `'שם המוטב'` killed `Vision: Fetch & B64`
> on every run). n8n shows it as *"Problem in node … Unexpected identifier"*, which looks like a node
> bug, not a quoting bug. Fixes, pick one: wrap inner labels in **Hebrew gershayim `«…»`** or plain
> guillemets (they're just text to Gemini, zero meaning lost); or use **double quotes** for the inner
> labels since the outer string is single-quoted; or make the whole `promptText` a **template
> literal** with backticks `` `…` `` so single quotes inside are harmless. Whichever you choose,
> **syntax-check before delivering** — extract every Code node's `jsCode`, wrap it in
> `async function f(){ … }`, and run `node --check`. This catches the broken string, an `await`
> outside async, and a stray brace in seconds, instead of on the user's first run. (The Python builder
> should do this automatically on every Code node it emits.)

Then: `Vision: Fetch & B64 → IF Vision OK? → (true) Vision: Gemini Classify → Vision: Parse Kind` and
`(false) → Vision: Parse Kind` (which, seeing `!vision_ok`, stays `graphic`).

`Vision: Gemini Classify` HTTP node:
- URL `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent`
- Auth via header `x-goog-api-key: {{ $env.GEMINI_API_KEY }}` (documented; keeps the key out of the URL).
  (`?key=…` also works but should still use `{{ $env.GEMINI_API_KEY }}`, never a literal key.)
- Body: `={{ $json.geminiBody }}` — **do not** rebuild the object inline here.
- `onError: continueRegularOutput` so a 400 never kills the flow.

> The `vision_debug` field is the diagnostic that ends the guessing: `len=63619 sniff=image/jpeg
> head=...JFIF...` = good image; `len=87 head={"error":...` = the download returned a JSON/HTML error
> (bad token / expired link), not an image.

`Vision: Parse Kind` (reads candidates if present, applies the confidence gate):

```js
const f = $('Vision: Fetch & B64').item.json;
let kind='graphic', fullName='', amount=0, confidence=0;
if (f.vision_ok) {
  try {
    let txt = (($json.candidates||[])[0]?.content?.parts?.[0]?.text || '').trim();
    txt = txt.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim();
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) { const o = JSON.parse(m[0]);
      if (o.kind==='receipt') kind='receipt';
      fullName = (o.full_name||'').toString().trim();
      // coerce hard — Gemini may return "100.00" / "₪100"
      amount = Number(String(o.amount ?? 0).replace(/[^0-9.]/g,''))||0;
      confidence = Number(o.confidence)||0;
    } else if (/receipt/i.test(txt)) kind='receipt';
  } catch(e){ kind='graphic'; }
}
if (kind==='receipt' && confidence < 55) { kind='graphic'; fullName=''; amount=0; }
return [{ json: { ...f, kind, rcpt_name:fullName, rcpt_amount:amount, rcpt_conf:confidence, needsVision:false } }];
```

---

## §4 — Reuse the bytes the classifier already downloaded (don't fetch twice)

After `Vision: Fetch & B64` has the base64, a later HTTP `Receipt: Download` that re-fetches
`{{ $json.link }}` fails with **`Invalid URL: …must start with http`** — `link` is no longer on the
item after passing through the Vision/IF chain. Make the receipt step a **Code node** that reuses
`vision_b64` and only downloads on the keyword path (which skipped Vision):

```js
const meta = $('IF Is Receipt?').item.json;
const token = $env.WHAPI_TOKEN;
let b64 = meta.vision_b64 || '';
let mime = meta.vision_mime || meta.mime || 'image/jpeg';
if (!b64) {                                  // keyword path → fetch now
  try {
    let url = meta.mediaId ? ('https://gate.whapi.cloud/media/'+meta.mediaId) : meta.link;
    let resp = await this.helpers.httpRequest({ method:'GET', url, encoding:'arraybuffer',
      headers: token ? { Authorization:'Bearer '+token } : {}, returnFullResponse:true });
    let buf = Buffer.isBuffer(resp.body) ? resp.body : Buffer.from(resp.body);
    b64 = buf.toString('base64').replace(/^data:[^;]+;base64,/, '');
  } catch(e){ b64=''; }
}
return [{ json: {
  chat_id: meta.chatId, phone: meta.phone, file_b64: b64, mime,
  filename: meta.filename || ('receipt_'+Date.now()+'.jpg'),
  caption: meta.caption || '', senderName: meta.senderName || '',
  rcpt_name: meta.rcpt_name || '', rcpt_amount: Number(meta.rcpt_amount)||0
} }];
```

This removes the duplicate download **and** the empty-URL crash. Drop the separate `…: To Base64`
node and repoint references to this one.

---

## §5 — Payment-link confirm-gate (don't fire on the summary turn)

If `isOrder` is computed as `total > 0` the instant the agent prints `[ORDER:{…}]`, the payment link
goes out while the bot is still *asking* "האם לאשר?". A prompt rule ("emit [ORDER] only after the
customer confirms") is necessary but insufficient on small models. Add a deterministic gate in the
`Parse Order` Code node, reading the customer's last text:

```js
// after computing isOrder from the [ORDER] block:
const userText = ($('Bot Allowed?').item.json.mergedText || '').toString();
const CONFIRM = /(^|[\s,.!])(כן|מאשר|מאשרת|אישור|לאשר|אשר|מאושר|סגור|סגרנו|סבבה|אוקיי|אוקי|אישרתי|מסכים|מסכימה|בסדר גמור|יאללה|נסגור|תסגור|אפשר לסגור|לסגור|ok|yes|confirm|approve)([\s,.!?]|$)/i;
const NEG = /(לא|עדיין לא|רגע|חכה|המתן|שנייה|תחכה|לא בטוח|אולי|בהמשך|לא עכשיו)/i;
const confirmed = CONFIRM.test(userText) && !NEG.test(userText);
if (isOrder && !confirmed) { isOrder = false; }   // summary turn → no link yet
```

Pair with a prompt line: when the message shows a summary and asks "האם לאשר?", that turn must **not**
contain `[ORDER]`; emit it only on the turn *after* an explicit yes. "אולי כן" is treated as
not-confirmed (safe default).

**If you add the gate as a SEPARATE node instead of folding it into `Parse Order`, repoint the
downstream IF — or the gate does nothing.** On the live T-CENTER V2.7 fix the gate went in as its own
`Approval Gate` Code node wired `Send Summary / Reply → Approval Gate → IF Order Closed`. But
`IF Order Closed`'s condition still read `={{ $('Parse Order').item.json.isOrder }}` — the *original*
value, computed before the gate ran — so the link fired on the summary turn exactly as before, and the
new node looked inert. A node-by-name reference in n8n **always pulls that node's own output**, not
whatever ran most recently on the wire; inserting a transformer mid-chain does not redirect a
downstream `$('OtherNode')`. Fix: point the IF (and anything else gating on the order) at the gate —
`={{ $('Approval Gate').item.json.isOrder }}`. Lesson generalizes: **after inserting any Code node
that rewrites a field, grep the workflow for `$('<upstream node>')` references to that field and
re-point the ones that should see the new value.** Folding the logic *into* the existing
`Parse Order` node (as the snippet above does) sidesteps this entirely — prefer that unless you need
the gate reusable or want to keep `Parse Order` pure.

---

## §6 — Receipt→order matching (name AND amount) + customer wording

**There is no shared id between the business invoice and the customer's bank asmachta.** The invoice
number (e.g. EZcount `91096`) is not carried by the bank into the transfer, and the asmachta number
(`008836`) is not on the invoice. So **name + amount is the only viable match key** — not a document
id, not the EZcount `doc_uuid`.

Add a real `invoice_name` column to `orders` (backfill from the snapshot) so the match is indexable:

```sql
alter table public.orders add column if not exists invoice_name text;
update public.orders set invoice_name = order_snapshot->>'invoice_name'
  where invoice_name is null and order_snapshot ? 'invoice_name';
create index if not exists orders_chat_status_total_idx on public.orders (chat_id, status, total);
```

`Receipt: Pick Order` — fetch the chat's open orders, then:

```js
function norm(s){ return (s||'').toString().toLowerCase()
  .replace(/["'`׳״]/g,'').replace(/בע[\"']?מ/g,'בעמ')
  .replace(/[^\u0590-\u05ffa-z0-9]/g,'').trim(); }
const meta = $('Receipt: Download').item.json;
const rcptName = norm(meta.rcpt_name), rcptAmount = Number(meta.rcpt_amount)||0;
const open = items.map(i=>i.json).filter(r=>r&&r.status==='open')
  .sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));
const amtEq = (a,b)=> Math.abs(Number(a||0)-Number(b||0)) <= 1;     // ±1 rounding
const nameEq = (a)=>{ const o=norm(a); if(!rcptName||!o) return false;
  return o===rcptName || o.includes(rcptName) || rcptName.includes(o); };

let target=null, matchType='none';
target = open.find(r=> amtEq(r.total,rcptAmount) && nameEq(r.invoice_name)); if(target) matchType='name_amount';
if(!target){ const b=open.find(r=>amtEq(r.total,rcptAmount)); if(b){target=b;matchType='amount_only';} }
if(!target && rcptAmount===0){ const b=open.find(r=>nameEq(r.invoice_name)); if(b){target=b;matchType='name_only';} }
const autoPaid = (matchType==='name_amount');
```

Branch on `autoPaid`:
- `name_amount` → `IF Has Open Order? [true]` → mark `status='paid'`, silence the bot until next
  business day (Pattern L), notify customer **+ group + email**.
- `amount_only` / `name_only` / `none` → **manual-check** branch (§7 alert), do **not** mark paid.

**Customer wording matters.** On the not-matched branch, a cautious message ("we're verifying, we'll
contact you if there's a gap") makes customers re-send the screenshot repeatedly. Use a calm,
reassuring close instead; keep the paid branch unambiguous:

- Not matched → `קיבלנו את האסמכתא, תודה! 🙏 הצוות יוודא את התשלום ויחזור אליך בהקדם.`
- Matched/paid → `קיבלנו את האסמכתא ואימתנו את התשלום ✅ ההזמנה סומנה כשולמה ועוברת לטיפול. תודה!`

The team still gets the truthful manual-check alert; only the customer copy is calm.

---

## §7 — Owner-facing group "verification" alerts (BRJewelry / Shai pattern)

Reusable for any "owner needs to act on this chat" notice (handoff, branch visit, manual payment
check). Post to the group `…@g.us` with an emoji header, the **full international phone**, a **short
order description** (from `order_snapshot.desc || product+quantity`), and a **clickable `wa.me` deep
link** to the customer chat (phone is already `972XXXXXXXXX`, no `+`):

```
🔴 בדיקת תשלום ידנית!

👤 שם באסמכתא: <rcpt_name | —>
📞 טלפון: <phone>
💰 סכום באסמכתא: <rcpt_amount | —> ₪
📦 הזמנה: <order_desc> (<nearest_total> ₪, <nearest_name>)   // or "לא נמצאה הזמנה פתוחה תואמת"
🔎 סוג התאמה: <matchType>

💬 חזרה ללקוח: https://wa.me/<972…>

נא לבדוק ולסמן ידנית. האסמכתא נשמרה ונשלחה למייל.
```

To surface the short desc, have `Receipt: Pick Order` also return it from the matched (or nearest
open) row:

```js
function shortDesc(r){ if(!r) return ''; let s=r.order_snapshot;
  if(typeof s==='string'){ try{s=JSON.parse(s);}catch(e){s={};} } s=s||{};
  if(s.desc) return String(s.desc);
  if(s.product) return (s.quantity?(s.quantity+' '):'')+String(s.product); return ''; }
const nearest = open[0] || null;
// return … order_desc: shortDesc(target||nearest), nearest_total, nearest_name
```

Original BRJewelry source nodes (`Notify Handoff` / `Notify Visit`) use the same shape with
`https://wa.me/972 + phone.slice(1)` when the stored phone starts with a local `0`. Match the format
to however the phone is stored (full `972…` → use as-is; local `05…` → `972`+`slice(1)`).

---

## Media path wiring (summary)

```
Webhook → IF Is Media → Extract Media → Classify Media
  → IF Needs Vision?
       ├─ true  → Vision: Fetch & B64 → IF Vision OK?
       │             ├─ true  → Vision: Gemini Classify → Vision: Parse Kind ┐
       │             └─ false → Vision: Parse Kind ───────────────────────────┤
       └─ false ────────────────────────────────────────────→ IF Is Receipt? ◄┘
  IF Is Receipt?
       ├─ receipt → Receipt: Download (reuse vision_b64) → Store(kind=receipt)
       │            → Find Open Order → Pick Order(name+amount) → IF Has Open Order?
       │                 ├─ paid → Mark Paid → silence → reply ✅ + group + email
       │                 └─ else → manual-check alert 🔴 + calm reply + email
       └─ graphic → Download Media (binary) → … existing graphic handoff (agent reply, one message)
```

Stamp `graphics.kind` (`'graphic'`/`'receipt'`, with a `CHECK` constraint) so the order email can
exclude receipts (`kind != 'receipt'`). Don't add a parallel "got your image" node on the graphic
branch — the agent already acknowledges it; a second send is the **double-reply** bug.
