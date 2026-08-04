# Sub-workflows & the Execute Workflow data hand-off (read before splitting logic across workflows)

Splitting a flow into a parent + a called sub-workflow (`n8n-nodes-base.executeWorkflow` →
`executeWorkflowTrigger`) looks clean, but the **data hand-off between them is the single most
fragile thing in n8n** and cost a full debugging session on T-CENTER. Most failures are silent: the
sub-workflow runs with an **empty input**, every `$json.field` is `undefined`, and the first
expression that touches it (often a `.split()` or a JSON body) throws — surfacing as a misleading
error far from the real cause. Read this before you reach for a sub-workflow.

## The decision: inline vs sub-workflow

- **Agent TOOL that the LLM calls** (`toolWorkflow`) → sub-workflow is correct and expected. The
  agent passes explicit inputs; this is the designed path.
- **Sequential state / side-effect logic** (order-state machine, invoice creation, "do X then Y on
  the main path") that needs data from an **upstream node in the parent** (e.g. `$('Parse Order')`)
  → **keep it INLINE in the same workflow.** A sub-workflow **cannot** reference parent nodes
  (`$('Parse Order')` doesn't exist inside the child), so you'd have to forward every field through
  the trigger — and the hand-off (below) breaks in three different ways. Inlining the nodes on the
  `IF …[true]` branch, all referencing `$('Parse Order')`, is simpler, has zero hand-off surface,
  and is exactly how the monolith worked. **Default to inline; only split when there's a real reuse
  or isolation reason.**

When in doubt: if the sub-workflow would need `$('SomeParentNode')`, don't make it a sub-workflow.

## The three hand-off failures (all silent)

### 1. "Only one 'Execute Workflow Trigger' node is allowed in a workflow"
Happens when you **import a sub-workflow's JSON *into* the parent** (Import into current workflow)
instead of as its own workflow — now the canvas has the parent's trigger **and** the child's
`When Called` trigger. Fix: a sub-workflow is a **separate** workflow. Create a new empty workflow
first, then Import from File **into that**. The parent only ever *references* the child by id (via
the Execute Workflow node); it never contains the child's nodes.

### 2. The parent passes an EMPTY object → the child gets nothing
The Execute Workflow (parent) node stores its input mapping as:
```
workflowInputs: { mappingMode: "defineBelow", value: {} }   // ← empty = passes nothing
```
When `value` is empty `{}`, the child's `When Called` trigger receives an empty item regardless of
what the upstream node output. The child's `Decide`/first node then reads `undefined` for every
field. **This is driven by the child trigger's mode**, not the parent:

- Set the child **`executeWorkflowTrigger` → Input data mode = "Accept all data"** (passthrough;
  param `inputSource: "passthrough"`). Then the parent passes all incoming items and the empty
  mapping disappears.
- If the parent still shows an empty "Define below" table after you change the child, **delete and
  re-add the Execute Workflow node** in the parent — it caches the child's input schema at the time
  it was added, so it must be re-added to pick up the new passthrough mode.

Symptom to recognize: the child's INPUT panel shows only *some* fields (the ones built inside the
child, e.g. `newHash/action`) and is **missing the upstream fields** (`chatId`, the order fields).
That missing-field tell means the hand-off is empty.

### 3. An HTTP node between the source and the call REPLACES the item
If the parent path is `Parse Order → Send Summary (HTTP) → IF → Execute Workflow`, the item flowing
into the Execute Workflow node is the **HTTP response of Send Summary** (e.g. `{sent:true,…}`),
**not** the Parse Order fields — an HTTP Request node's output replaces `$json`. So even with
"Accept all data", the child receives the WHAPI response, not the order. Two fixes:

- **Bridge with a Code node** right before the Execute Workflow call:
  `return [{ json: $('Parse Order').item.json }];` — forwards the full upstream item into the child.
- Or **branch earlier** so the Execute Workflow call is fed directly from the data source (parallel
  to the HTTP send), and an `IF` that only *references* the source by name passes its own input item
  through.

Remember: an `IF` node passes through **its input item**, and that item is whatever the immediately
preceding node emitted (an HTTP node ⇒ the response). `IF` referencing `$('Parse Order')` in its
*condition* does **not** change the item it forwards.

## Standalone-testing caveat
Running a sub-workflow alone (Execute step on it) always sees an **empty `When Called`** input, so
it will fail the same way as an empty hand-off. Test sub-workflows through the **real parent path**,
or pin (📌) a representative input item on the `When Called` trigger first.

## Sub-workflow ordering on publish
The parent can't be activated while its Execute Workflow node points at an unpublished/placeholder
child id. Publish the child first, copy its id (or use the From-list picker), paste/select it in the
parent, then activate the parent. (Same ordering as `toolWorkflow` agent tools — see Delivery in
SKILL.md.)

## Bottom line
For state machines and invoice/side-effect logic on the main path: **inline beats sub-workflow.**
Reserve sub-workflows for agent tools and genuinely reusable/isolated units, and when you do split,
set the child trigger to **Accept all data**, watch for an **HTTP node eating the item** before the
call, and **re-add** the parent Execute Workflow node after changing the child's input mode.
