# Build method — assemble n8n workflows with Python

Hand-writing n8n JSON breaks because of cross-referenced connections. Build with a script instead.
This pattern keeps node ids, positions, and wiring consistent and makes validation trivial.

## The skeleton

```python
import json

nodes = []
conns = {}

def add(node):
    nodes.append(node)
    return node["name"]            # return name so connections can reference it

def link(src, dst, typ="main", src_index=0, dst_index=0):
    """Connect src -> dst. typ is 'main' for normal flow, or a LangChain type
    ('ai_languageModel', 'ai_memory', 'ai_tool') for AI sub-nodes."""
    c = conns.setdefault(src, {})
    arr = c.setdefault(typ, [])
    while len(arr) <= src_index:
        arr.append([])
    arr[src_index].append({"node": dst, "type": typ, "index": dst_index})

def pos(x, y):
    return [x, y]
```

## Defining a node

Every node needs: `parameters`, `id`, `name`, `type`, `typeVersion`, `position`. Trigger nodes and
nodes with webhooks also need a `webhookId`. Credentialed nodes need a `credentials` block (use a
fake id + descriptive name).

```python
n_http = add({
    "parameters": {
        "method": "POST",
        "url": "https://api.example.com/endpoint",
        "sendBody": True, "specifyBody": "json",
        "jsonBody": "={{ { key: $json.value } }}",
        "options": {}
    },
    "id": "unique-node-id", "name": "Readable Node Name",
    "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.4,
    "position": pos(400, 200)
})
```

## Wiring

```python
link(n_trigger, n_next)                              # normal flow
link(n_llm, n_agent, typ="ai_languageModel")         # AI model -> agent
link(n_memory, n_agent, typ="ai_memory")             # memory -> agent
link(n_tool, n_agent, typ="ai_tool")                 # tool -> agent
link(n_switch, n_branch_a, src_index=0)              # switch output 0
link(n_switch, n_branch_b, src_index=1)              # switch output 1
link(n_imageNode, n_merge, dst_index=0)              # into merge input 0
link(n_videoNode, n_merge, dst_index=1)              # into merge input 1
```

The `dst_index` matters for Merge nodes (each branch into a distinct input) and for IF/Switch the
`src_index` selects which output. Normal nodes use index 0 on both sides.

## Positioning

Lay nodes left-to-right following flow. Main flow on one horizontal line (same y). AI sub-nodes sit
*below* their agent (higher y), since they connect upward via the `ai_*` types. Space columns ~240px
apart, branches ~200px apart vertically. Good positioning makes the imported canvas readable; it
doesn't affect function but the user will thank you.

## Assemble and write

```python
workflow = {
    "name": "Descriptive Name [TEMPLATE]",
    "nodes": nodes,
    "connections": conns,
    "settings": {"executionOrder": "v1"},
    "pinData": {},
    "meta": {"templateCredsSetupCompleted": False}
}

out = "/home/claude/build/workflow.json"
with open(out, "w", encoding="utf-8") as f:
    json.dump(workflow, f, ensure_ascii=False, indent=2)   # ensure_ascii=False keeps Hebrew readable
```

Always `ensure_ascii=False` so Hebrew/emoji in sticky notes and messages stay legible in the file.

## Long system prompts inside jsonBody

When embedding a long system prompt into an HTTP `jsonBody` expression, build the prompt as a Python
string and inject it with `json.dumps(prompt, ensure_ascii=False)` so quotes/newlines are escaped
correctly:

```python
body = (
    "={{ {\n"
    "  system_instruction: { parts: [ { text: " + json.dumps(system_prompt, ensure_ascii=False) + " } ] },\n"
    "  contents: [ { role: 'user', parts: [ { text: $json.user_text } ] } ]\n"
    "} }}"
)
```

For the AI Agent node, the system prompt goes in `parameters.options.systemMessage` prefixed with
`=` (to make it an expression), and the user text in `parameters.text` with `promptType: "define"`.

## Delivering a surgical fix — emit ONE node to paste, not a re-import

For editing a **live** workflow (vs. shipping a new one), the smallest delivery wins: it preserves
the user's credentials and touches nothing else. n8n's canvas accepts **paste from clipboard JSON**
— `{"nodes":[ … ], "connections":{ … }}`, **Ctrl+V instantiates the node(s)**. So build the single
gate/fix node with the same skeleton and emit just it:

```python
import json
filter_node = {
    "parameters": { "conditions": { "options": {"caseSensitive": True, "typeValidation": "loose", "version": 2},
        "conditions": [
            {"id":"blk1","leftValue":"={{ $json.chat_id }}","rightValue":"972509506702@s.whatsapp.net","operator":{"type":"string","operation":"notEquals"}},
        ], "combinator": "and" }, "options": {} },
    "id": "blocklist-recv-0001", "name": "Block List",
    "type": "n8n-nodes-base.filter", "typeVersion": 2.2, "position": [1660, 960]
}
print(json.dumps({"nodes":[filter_node], "connections":{}}, ensure_ascii=False))
```

Hand the user that one-liner + the 1–2 wires to draw (`Prep for Processor → Block List →
Call Processor`). **Connections to pre-existing nodes don't survive a paste** — only links *among the
pasted set* do — so the re-wire is always manual; say which wires. For a one-field change, skip the
paste entirely and just name the node + field + value. Re-import the whole workflow only for broad
changes (and keep the same `id` so it updates in place and `Execute Workflow`-by-id refs still
resolve). See `references/debugging.md` for the full live-fix decision order.
