# HYP / Yaad-Sarig (YaadPay) — payment links in n8n

Hyp (הייפ) is the rebrand of **Yaad-Sarig / YaadPay** — one product, several hostnames. It's the
sliqa (סליקה) provider behind a large share of Israeli SMB checkouts, so it recurs constantly in
Shift Digital sales bots. This reference is the hard-won, verified-against-a-live-terminal account of
how to generate a payment link from it inside n8n. Read it for **any** build that takes a card
payment or sends a "לינק לתשלום" — especially conversational WhatsApp sales bots.

The single most important fact, learned the slow way: **the HTTP call to Hyp must NOT live inside a
`toolCode` (Custom Code Tool) node.** It silently fails there in current n8n. Put it in the main flow
as a real HTTP Request node. Full reasoning in `references/toolcode_limits.md`; the pattern is below.

---

## 1. Which API is this? (identifying the right one)

There are two distinct Hyp products. Pick by the credentials the client has:

- **Hyp Pay / YaadPay (the classic one)** — credentials are **API Key**, **PassP**, and a terminal
  number **Masof**. The merchant portal shows exactly these three fields. This is what almost every
  SMB has. Everything in this file is about this API.
- **Hyp Enterprise (CreditGuard)** — a newer, different API (`developers.hyp.co.il`, CreditGuard
  stack). Different auth, different flow. If the client's screen shows API Key + PassP + Masof, they
  are **not** on this one — don't follow CreditGuard docs.

Tell them apart by the merchant screen: API Key + PassP + מספר מסוף (Masof) ⇒ classic Hyp Pay.

### Credentials and what each is
| Field | What it is | Notes |
|-------|-----------|-------|
| `Masof` | Terminal number (מספר מסוף) | e.g. `4502119532`. Numeric. Test terminals start `00100…`. |
| `KEY` | API Key | long hex string from the portal |
| `PassP` | Password parameter | **the secret**. Treat like a password. |

A real production Masof runs **real charges** — only test with the sandbox card below and tiny
amounts.

---

## 2. Endpoints (both work — be consistent)

Hyp Pay is a **GET-with-query-string** API. Two interchangeable hostnames, same contract:

- `https://pay.hyp.co.il/p/` (Hyp-branded)
- `https://icom.yaad.net/p/` (legacy Yaad host)

Pick one and use it for **both** the sign call and the final link. Don't mix hosts in one flow.

There is **no JSON body and no JSON response** — request params go in the query string, and the
response comes back as a **URL-encoded query string** (not JSON). Set any HTTP node reading it to
**response format = text/string**, never JSON.

---

## 3. The two-step model (this is the whole thing)

You cannot just hand-build a payment URL — Hyp won't honor an unsigned one. You ask Hyp to **sign**,
then wrap its answer into the link.

**Step 1 — APISign request.** GET the endpoint with `action=APISign&What=SIGN&Sign=True` plus your
credentials and the transaction params. Hyp returns the **same params back, plus `action=pay` and a
`signature=…`** appended.

**Step 2 — build the link.** Take Hyp's entire returned query string verbatim and prefix it with the
endpoint. That string **already contains `action=pay`** — do **not** add another. The result is the
live payment link you send the customer.

```
Final link = https://pay.hyp.co.il/p/?<the exact string Hyp returned, which includes action=pay&signature=...>
```

A correct signed response looks like:
```
Amount=490&ClientName=%D7%91...&Coin=1&Info=...&Masof=4502119532&Order=BR12345&PageLang=HEB&Sign=True&action=pay&signature=5359b8f9849c64792baf117a8c94f777cb86d18057fc456ba76b907def4ab4ff
```
If the response has **no `signature=`**, it's an error string (bad Masof/PassP/KEY, or API not
enabled) — surface it, don't send a link built from it.

---

## 4. Parameters

### Sent in the APISign request
**Required:**
| Param | Value |
|-------|-------|
| `action` | `APISign` |
| `What` | `SIGN` |
| `Sign` | `True` |
| `Masof` | terminal number |
| `KEY` | API key |
| `PassP` | password parameter |

**Transaction (optional but normally set):**
| Param | Meaning |
|-------|---------|
| `Amount` | amount in the coin's units |
| `Coin` | `1`=ILS (default), `2`=USD, `3`=EUR, `4`=GBP |
| `Tash` | max number of installments the payer may choose |
| `Order` | your internal order id (use it — it's your reconciliation key) |
| `Info` | free-text description (shows on the page / invoice / dashboard) |
| `UserId` | payer national id (ת"ז) |
| `ClientName` / `ClientLName` | first / last name |
| `email` | payer email |
| `cell` | payer mobile |
| `street` / `city` | address |
| `sendemail` | `True` ⇒ Hyp emails the payer a confirmation (needs `email` set to actually send) |
| `tmp` | payment-page template number |
| `PageLang` | `HEB` or `ENG` |
| `UTF8` / `UTF8out` | `True` — keep Hebrew values encoded correctly in and out |
| `MoreData` | `True` ⇒ richer fields echoed back on return |
| `J5` | `True` ⇒ J5 hold/authorization instead of immediate charge (advanced) |

Every value must be **URL-encoded** (Hebrew in `Info`/names/address especially). The n8n HTTP Request
node's **Query Parameters** UI encodes for you — prefer it over hand-building the string. If you do
build the string in code, wrap each value in `encodeURIComponent(...)`.

### Returned on the customer's redirect after payment
When the payer finishes, Hyp redirects to your success/return URL with params including:
| Param | Meaning |
|-------|---------|
| `CCode` | result code. **`0` = success.** Other values = decline/special (e.g. `700`/`800` are deferred approvals, not failures). |
| `Id` | Hyp transaction id |
| `Amount`, `Order` | echoed back |
| `ACode` | authorization code |

Treat `CCode=0` as paid. For real reconciliation, do a server-side **Verify** call (below) rather
than trusting the redirect, since a redirect URL can be forged.

---

## 5. Verifying a payment (don't trust the redirect blindly)

To confirm a transaction really happened and wasn't spoofed, call APISign again with
`What=VERIFY` (verifies the signature/details of a returned transaction). At minimum this guards
against someone hitting your success URL with a fake `CCode=0`. For a sales bot that only **sends** a
link, you can defer this; for anything that grants goods/an invoice on payment, add it.

---

## 6. The n8n shape that actually works

Because the Hyp call can't run inside `toolCode`, model it like the **T-CENTER deterministic payment
pattern**: the agent decides *that* a sale closed and *how much*, but the **HTTP to Hyp lives in the
main flow**.

```
AI Agent  (emits a structured close marker in its text, e.g. [ORDER: {"amount":1990,"name":"...","info":"..."}])
   → Parse Order        (Code node: regex-extract the JSON, strip the marker from the reply, expose amount/name/info/order)
   → IF Order Closed
        ├─ true  → Hyp APISign      (HTTP Request node, GET pay.hyp.co.il/p/, query params, response=text)
        │            → Build Pay Link (Code node: if signature present → endpoint + '?' + response; else friendly fallback)
        │            → Send Pay Link  (HTTP Request → Green API sendMessage)
        └─ false → Send Reply        (HTTP Request → Green API sendMessage, the normal agent text)
```

Why this and not a tool: the amount flows through deterministic code, not the LLM's free choice, so a
model slip can't mis-price a charge; and the HTTP call sits where HTTP works.

### Credentials placement
Put `Masof`/`KEY`/`PassP` in **n8n environment variables** (`$env.HYP_MASOF`, `$env.HYP_KEY`,
`$env.HYP_PASSP`) — never hard-coded in a node and never in the agent prompt. The HTTP Request query
params reference `={{ $env.HYP_KEY }}` etc. This keeps the secret off the canvas and out of exports.

### Hyp APISign — HTTP Request node (keypair query params)
```
Method: GET
URL:    https://pay.hyp.co.il/p/
Send Query Parameters: ON  (keypair)
  action=APISign  What=SIGN  Sign=True
  KEY={{ $env.HYP_KEY }}   PassP={{ $env.HYP_PASSP }}   Masof={{ $env.HYP_MASOF }}
  Amount={{ $json.amount }}   Order={{ $json.order }}
  Info={{ $json.info }}   ClientName={{ $json.name }}
  UTF8=True  UTF8out=True  PageLang=HEB  Coin=1  Tash=1  tmp=1
Options → Response → Response Format: Text
```

### Build Pay Link — Code node
```js
const signed = String($json.data || $json.body || '').trim();   // text response
const chatId = $('Parse Order').item.json.chatId;
if (!signed.includes('signature=')) {
  return [{ json: { chatId, ok:false,
    message: 'הזמנתך נשמרה ✨ נציג ישלח לך לינק לתשלום בקרוב 🙂',
    debug: signed.slice(0,200) } }];
}
const paymentUrl = 'https://pay.hyp.co.il/p/?' + signed;   // response already has action=pay
return [{ json: { chatId, ok:true,
  message: 'מעולה! קישור לתשלום מאובטח 💳\n' + paymentUrl + '\nאחרי התשלום אחזור עם אישור 🙂' } }];
```

### If you *must* call Hyp from a Code node (not a tool)
A **plain Code node** (not `toolCode`) *does* expose `this.helpers.httpRequest` — use it, never
`fetch` (which is undefined in n8n Code nodes):
```js
const signed = String(await this.helpers.httpRequest({
  method: 'GET', url: `https://pay.hyp.co.il/p/?${qs}`, json: false,
})).trim();
```
This is fine for a Code node sitting in the main flow. It is **not** available in `toolCode`.

---

## 7. Testing

- **Sandbox card (success):** number `5326107300020772`, exp `05/31`, CVV `033`, ת"ז `890108558`.
  Keep `Amount` tiny (₪10) on a test terminal (`00100…`). A production Masof charges for real.
- **Only valid way to test the whole bot:** trigger the real flow (send the WhatsApp message) and let
  the agent emit `[ORDER:…]`. Running the Hyp HTTP node alone with a hard-coded amount is fine for
  checking the Hyp call itself; the agent path is what proves end-to-end.
- A bare Code node with literal params is the quickest way to confirm credentials/endpoint return a
  `signature=` before wiring the agent — do that first when a new terminal is involved.

---

## 8. Failure dictionary (what we actually hit)

| Symptom | Cause | Fix |
|---|---|---|
| `fetch is not defined` | `fetch` doesn't exist in n8n Code/`toolCode` | use `this.helpers.httpRequest` (Code) or an HTTP Request node |
| `Cannot assign to read only property 'name' of object 'Error: No execution data available'` on a tool | HTTP attempted inside `toolCode`; toolCode context lacks the helper | move the call to a main-flow HTTP Request node (§6) |
| Response has no `signature=` | wrong `PassP`/`KEY`/`Masof`, or API not enabled on the terminal | re-copy PassP from portal; confirm API access enabled; check Masof |
| Hebrew shows broken on the page | missing `UTF8`/`UTF8out` or unencoded values | add `UTF8=True&UTF8out=True`; URL-encode values |
| `action=pay` appears twice in the link | added `action=pay` on top of Hyp's response | wrap response as-is; it already includes `action=pay` |
| Tool node 400s on "Execute step" | tools can't run standalone (empty `$fromAI`) | test from the real trigger, never the tool's Execute button |

---

## 9. Security note

`PassP` and `KEY` are secrets. If they ever appear in a chat, a screenshot, or a shared export,
**rotate the PassP in the Hyp portal**. Keeping them in `$env` (not in nodes) means a rotation is a
one-line env change, not a node edit — another reason for the env placement in §6.

---

## 10. EZcount — invoice + payment page in one call (the T-CENTER pattern)

A different route to "charge a card and send a link" that **also issues the tax document**: EZcount
(חשבונית ירוקה–style API that wraps Hyp/Yaad for the clearing). One `createDoc` call creates the
document **and** yields a hosted page that both shows the invoice and offers card payment. Use this
when the client wants the invoice issued automatically alongside the charge (Israeli law requires a
document on payment), rather than just a bare Hyp link.

**Endpoint:** `POST https://api.ezcount.co.il/api/createDoc`

**The api_key goes in the BODY, not a header.** EZcount does **not** use `Authorization`/Bearer — so
on the HTTP Request node, **don't attach a Header Auth credential** (a leftover Header Auth here is
harmless but does nothing and confuses debugging). Just `Send Body` = JSON:

```
={{ {
  api_key: $env.EZCOUNT_API_KEY,            // keep in $env, not inline
  developer_email: "dev@<agency>.co.il",
  type: 300,                                // 300 = חשבונית/proforma → yields a payment page
  customer_name: ($('Parse Order').item.json.o_invoice_name
                  && $('Parse Order').item.json.o_invoice_name !== '—'
                  ? $('Parse Order').item.json.o_invoice_name
                  : ($('Parse Order').item.json.senderName || 'לקוח')),
  customer_phone: $('Parse Order').item.json.chatId.split('@')[0],
  item: [ { details: $('Parse Order').item.json.desc, amount: 1,
            price: $('Parse Order').item.json.total, vat_type: 'INC' } ],
  dont_send_email: 1
} }}
```

`customer_name` must come from the **order's invoice name**, not the WhatsApp pushname — the customer
can ask for the invoice on a company / ע.מ / ח.פ. Capture an `o_invoice_name` in the order JSON
(default = sender name) and use the `||` fallback above.

**Build the payment link from the response.** `createDoc` returns a `doc_uuid`; the hosted
invoice-and-pay page is `https://www.ezcount.co.il/dp/?key=<doc_uuid>`. A Code node in the main flow:

```javascript
// Build Payment Link
const uuid = $json.doc_uuid;
if (!uuid) {
  return [{ json: { chatId: $('Parse Order').item.json.chatId, paymentLink: '',
            error: 'no doc_uuid in EZcount response', raw: $json } }];
}
const paymentLink = 'https://www.ezcount.co.il/dp/?key=' + uuid;
return [{ json: { chatId: $('Parse Order').item.json.chatId, paymentLink } }];
```

Then send `paymentLink` to the customer. **Flow shape (deterministic, same philosophy as Hyp §6):**
the agent never builds the link — it emits `[ORDER:{total,desc}]`, a Parse node extracts it, an
`IF Order Closed` gates, then `Create EZcount Invoice → Build Payment Link → Send Payment Link`.

### EZcount failure dictionary

| Symptom (in the `errMsg` / output) | Cause | Fix |
|---|---|---|
| `success: false`, *"API KEY … is not correct for the environment production … common to send the API KEY of demo.ezcount.co.il to api.ezcount.co.il"* | **demo key against the production URL.** Each environment has its own key. | Use the **production** key for `api.ezcount.co.il` (EZcount → Settings → API), or point the URL at `https://demo.ezcount.co.il/api/createDoc` for testing. The key is fine; the *environment* mismatches. |
| `Build Payment Link` errors / empty link | `Create EZcount Invoice` failed (no `doc_uuid` returned) | Fix the invoice call first; the link node depends on its `doc_uuid`. The guard above surfaces the raw response so you can see why. |
| `doc_uuid` present under a different key | response field name differs by account | open the real `createDoc` output and read the actual field; some accounts also return `sale_payment_link` you can use directly instead of building `dp/?key=`. |
| VAT comes out wrong | `vat_type` format mismatch | most accounts take `'INC'` (string); some expect a numeric code — verify against the account if VAT looks off. |

### "JSON parameter needs to be valid JSON" on the createDoc node — it's almost never the body format

This HTTP-Request error (Body Content Type = JSON, Specify Body = Using JSON) reads like the JSON is
malformed, but the **object expression `={{ { … } }}` is fine** — that's the form that works, and
**`JSON.stringify(...)` is NOT required** (it's a red herring; wrapping in stringify doesn't fix the
real cause and isn't needed). What actually happens: an **expression inside the body throws**, so n8n
can't evaluate it and reports the raw `{{ }}` as "invalid JSON." The usual culprit is a reference
that resolved to `undefined`:
- `$('SomeNode').item.json.chatId.split('@')[0]` when `chatId` is `undefined` (e.g. the node is in a
  **sub-workflow that received an empty hand-off** — see `references/subworkflows.md`) → `.split` of
  undefined throws → "invalid JSON."
- A reference to a node that **doesn't exist in this workflow** (e.g. `$('Parse Order')` used inside
  a sub-workflow where Parse Order lives in the parent).

Diagnose by checking the node's **INPUT panel**: if the fields the body references (`chatId`,
`total`, the order fields) are **missing**, the data isn't arriving — fix the hand-off/inline the
node, don't touch the body format. Quote style and object-vs-stringify are never the cause.

### Order STATE, not just creation

The `createDoc → Build Payment Link → Send` flow above creates **one** invoice per call — which
means every "send the link again" makes a **duplicate** document, and a paid customer can be
re-charged. To make the order durable (resend the same link on a repeat, replace on a change, and
**block re-charge after payment**), wrap this in the **order-state machine** —
`references/patterns.md` **Pattern J**. The proforma (`type:300`) has no binding accounting meaning,
so replacing an unpaid order is free (just mark the old row `superseded`; no credit note). The
**paid** status comes from EZcount's "document created" webhook filtered to the tax-receipt
(חשבונית מס קבלה, auto-issued on payment — **verify its exact `type` from a real payload; it is not
300**), matched to the open order by **customer phone = chat_id**.

**Security:** the EZcount `api_key` is a live secret — same rule as Hyp. Keep it in `$env`, and if it
ever lands in a chat/screenshot/export, rotate it in EZcount and swap the env value.

> Single-quoting a value in an n8n `{{ }}` expression (e.g. `api_key: '3f9c…'`) is fine — quote style
> is **not** a cause of failures here. When an EZcount call fails, it's the environment/key pairing or
> a missing body field, never the quotes.
