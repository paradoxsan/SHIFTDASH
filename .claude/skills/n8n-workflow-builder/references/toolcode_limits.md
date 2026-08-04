# `toolCode` (Custom Code Tool) — what it can't do, and what to use instead

The **Custom Code Tool** node (`@n8n/n8n-nodes-langchain.toolcode`) lets you hand the agent a tool
whose body is JavaScript that reads `$fromAI(...)` and returns a string. It's tempting for "let the
agent call this little function" tasks — generating a payment link, hitting a small API, formatting
something. But its execution context is **more restricted than a normal Code node**, and the failures
are silent and confusing. This file is the rule set for when to reach for it and when not to.

This came out of a real, multi-cycle debugging session building a Hyp payment-link tool. The
symptoms below are exactly what you'll see.

---

## 1. The core limitation: no HTTP from inside `toolCode`

Inside a `toolCode` body, **neither of the usual HTTP mechanisms is reliably available**:

- **`fetch` is undefined.** n8n doesn't run in a browser; `fetch` isn't a global in any Code-style
  node. → `ReferenceError: fetch is not defined`.
- **`this.helpers.httpRequest` is NOT available in `toolCode`** (current self-hosted, seen on
  2.10.x). It exists in a *plain* Code node, but not in the tool context. Calling it throws the
  generic, misleading:
  ```
  Cannot assign to read only property 'name' of object 'Error: No execution data available'
  ```
  That message has nothing to do with your code being wrong — it's n8n failing to run the helper in a
  context that doesn't provide it.

So: **a `toolCode` that tries to call any external API will fail.** Don't put network calls there.

### What `toolCode` *can* do
Pure, synchronous, in-memory work that returns a string: formatting, arithmetic, mapping an id to a
canned value, building a piece of text from `$fromAI` inputs, light validation. If the tool needs
**only** `$fromAI` inputs and JS (no network, no n8n helpers), `toolCode` is fine.

---

## 2. The "Execute step" trap (independent of the HTTP issue)

A tool node run via the **"Execute step"** button **never invokes the agent**, so every field driven
by `$fromAI(...)` comes back empty and the node errors with
`No execution data available` / a 400. This is **expected**, not a bug, and it looks identical
whether or not your code is correct — which makes it a huge time sink when combined with §1.

**Only valid test:** trigger the real flow (send the WhatsApp message / hit the webhook) so the model
populates the tool's inputs in a real function call. Tell the user explicitly; they will otherwise
keep clicking Execute step and reading the same error as if the code were broken.

Corollary: if you see `No execution data available`, first ask *"was this run from the real trigger
or from the tool button?"* before touching the code.

---

## 3. The fix: move the work into the main flow

When an agent needs a side effect that involves HTTP (call an API, create a payment link, write
somewhere custom), **don't model it as a `toolCode` tool.** Use the **deterministic main-flow
pattern** (the T-CENTER pattern):

1. The agent **signals intent in its text output** with a structured marker, e.g.
   `[ORDER: {"amount":1990,"name":"...","info":"..."}]`, and is told in the system prompt never to
   produce the marker unless the action should fire.
2. A **Parse/Code node** extracts the JSON from the agent output, strips the marker from the
   user-facing reply, and exposes clean fields.
3. An **IF node** branches on whether the marker was present.
4. The side effect runs as **real nodes** — an **HTTP Request node** (where HTTP actually works),
   then whatever sends the result back (e.g. Green API).

This is more reliable for money/side-effects anyway: the amount and the action flow through
deterministic code and an explicit branch, not the model's free choice, so a single model slip can't
silently mis-fire or mis-price.

```
Agent (emits [ORDER:{…}] only on close)
  → Parse Order (Code: extract+strip)
  → IF Order Closed
       ├─ true  → HTTP Request (the real API call) → Build result (Code) → Send (HTTP)
       └─ false → Send normal reply (HTTP)
```

### When a tool-shaped call really is the right ergonomics
If you genuinely want the agent to call something mid-conversation and HTTP is involved, the options
that *do* work are:

- **`toolHttpRequest`** (HTTP Request **Tool**) — a first-class tool that performs the HTTP via n8n's
  internal mechanism (not your JS), so it isn't subject to the `toolCode` limitation. Good when the
  call is a straightforward request the model parameterizes.
- **`toolWorkflow`** (Call n8n Workflow Tool) — point the tool at a **sub-workflow** that does the
  HTTP in normal nodes and returns a value. The agent calls one clean tool; the network call happens
  in a context where it works. Best when the side effect is multi-step (sign → wrap → return).

Reach for `toolHttpRequest` / `toolWorkflow` for agent-invoked HTTP; reserve `toolCode` for pure
string/logic helpers; and for money or critical side-effects, prefer the deterministic main-flow
branch over any tool.

---

## 4. Quick decision table

| You want the agent to… | Use |
|---|---|
| compute/format/validate something from its inputs (no network) | `toolCode` ✅ |
| make a simple HTTP call it parameterizes | `toolHttpRequest` |
| run a multi-step side effect (e.g. sign→wrap→return a link) | `toolWorkflow` (sub-workflow) |
| take a payment / charge / issue invoice / anything money | **deterministic main flow** (Agent emits marker → Parse → IF → HTTP), not a tool |
| call an API from a Code node in the main flow | plain **Code** node with `this.helpers.httpRequest` (never `fetch`) |

---

## 5. Other Code-node expression rules (carry over)

- **`fetch` is undefined** in every Code-style node — use `this.helpers.httpRequest` (plain Code) or
  an HTTP Request node.
- **`require()` is disallowed** on many self-hosted instances (`Module 'luxon' is disallowed`).
  Luxon's `DateTime`, plus `$now`, `$json`, `$input`, `$getWorkflowStaticData`, are **globals** — use
  them directly.
- **No nested `{{ }}`** inside an `={{ … }}` expression — concatenate with `+`.
- A `toolCode` body **returns a single string** to the model (not an items array). A plain Code node
  returns `[{ json: {…} }]`. Don't mix the two return shapes up when moving logic between them — this
  is a common slip when converting a failing `toolCode` into a main-flow Code node.
