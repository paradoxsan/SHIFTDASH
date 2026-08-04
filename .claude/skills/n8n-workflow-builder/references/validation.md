# Validation — run before delivering any workflow

Never hand over a workflow that hasn't passed these checks. They catch the failures that make an
import break or a flow misbehave. Run them as a Python script against the generated JSON.

## 1. JSON re-parses

```python
import json
wf = json.load(open(path, encoding="utf-8"))   # throws if malformed
```

## 2. No broken connection references

Every connection target (and source) must name a node that exists. This is the #1 cause of broken
imports.

```python
names = {n["name"] for n in wf["nodes"]}
bad = []
for src, data in wf["connections"].items():
    if src not in names:
        bad.append(f"source missing: {src}")
    for typ, outs in data.items():
        for out in outs:
            for c in out:
                if c["node"] not in names:
                    bad.append(f"target missing ({typ}) from '{src}': {c['node']}")
assert not bad, bad
```

## 3. AI connection types are correct

If the workflow has an AI Agent, its model/memory/tools must connect via `ai_languageModel`,
`ai_memory`, `ai_tool` — never `main`. Verify each agent actually has a language model attached
(an agent with no `ai_languageModel` connection will not run).

```python
agents = [n["name"] for n in wf["nodes"] if n["type"].endswith("langchain.agent")]
llm_targets = set()
for src, data in wf["connections"].items():
    for out in data.get("ai_languageModel", []):
        for c in out:
            llm_targets.add(c["node"])
for a in agents:
    assert a in llm_targets, f"agent '{a}' has no language model connected"
```

## 4. Required nodes are present

Sanity-check the shape matches what was promised. E.g. for a content bot: a trigger, the expected
number of agents, a Switch if routing was specified, a Merge if branches recombine, a memory node if
memory was requested.

```python
from collections import Counter
types = Counter(n["type"].split(".")[-1] for n in wf["nodes"])
# e.g. assert types["agent"] == 3, assert types["switch"] == 1, etc.
```

## 5. Encoding survived

If the workflow has Hebrew (or any non-ASCII) in sticky notes or messages, confirm it's intact and
not mojibake.

```python
sticky = next((n for n in wf["nodes"] if n["type"].endswith("stickyNote")), None)
if sticky:
    assert "\u05d0" <= max(sticky["parameters"]["content"]) or True  # spot-check a known phrase instead
```

Better: assert a specific known phrase appears, e.g. `assert "שם העסק" in some_node_content`.

## 5b. Runtime-safety checks (AI tools, calendar, code nodes)

These catch the failures that only surface at run time. Run them whenever the workflow has an agent
with tools, a Google Calendar node, or Code nodes. See `ai_tool_gotchas.md` for the why.

```python
import re

# (a) Every ai_tool target's SOURCE node name must start with ASCII (else tool name -> "_").
tool_sources = set()
for src, data in wf["connections"].items():
    if "ai_tool" in data:
        tool_sources.add(src)
for name in tool_sources:
    assert re.match(r'^[A-Za-z0-9_]', name), f"tool node name not ASCII-leading: {name!r}"

# (b) Google Calendar nodes must NOT use 'From list' (__rl mode 'list') -> 400 on create.
for n in wf["nodes"]:
    if n["type"].endswith("googleCalendar") or n["type"].endswith("googleCalendarTool"):
        cal = n["parameters"].get("calendar") or n["parameters"].get("calendarId") or {}
        if isinstance(cal, dict):
            assert cal.get("mode") != "list", f"{n['name']}: calendar in 'From list' mode — use 'id'"

# (c) No require() in Code nodes (luxon/others disallowed; DateTime is global).
for n in wf["nodes"]:
    if n["type"].endswith(".code"):
        code = n["parameters"].get("jsCode", "")
        assert "require(" not in code, f"{n['name']}: uses require() — disallowed; DateTime is global"

# (c2) SYNTAX-CHECK every Code node with `node --check`. Catches the Hebrew-single-quote string
# break (a "'שם המוטב'" inside a single-quoted promptText → SyntaxError: Unexpected identifier),
# an `await` outside async, and stray braces — before the user's first run, not after.
import subprocess, tempfile, os, shutil
if shutil.which("node"):
    for n in wf["nodes"]:
        if n["type"].endswith(".code"):
            code = n["parameters"].get("jsCode", "")
            # wrap so top-level await is legal, mirroring n8n's Code-node runtime
            wrapped = "async function __n8n_code(){\n" + code + "\n}\n"
            with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as fh:
                fh.write(wrapped); tmp = fh.name
            r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
            os.unlink(tmp)
            if r.returncode != 0:
                # pull the actual SyntaxError line, not node's version banner
                errln = next((l for l in r.stderr.splitlines() if "Error" in l), r.stderr.strip()[:200])
                raise AssertionError(f"{n['name']}: JS syntax error -> {errln}")
    print("code-node syntax: all Code nodes pass `node --check`")
else:
    print("code-node syntax: SKIPPED (node not on PATH) — run `node --check` manually before delivery")

# (d) No nested {{ }} inside an ={{ }} expression (won't evaluate).
for n in wf["nodes"]:
    for v in str(n.get("parameters", {})).split("'"):
        if v.startswith("={{") and "{{" in v[3:]:
            pass  # spot-check manually; a strict check is noisy. Flag in review.

print("runtime-safety: ASCII tool names OK, no 'From list' calendars, no require() in code")
```

If (a) or (b) fail, fix the builder (rename tool nodes to ASCII; set calendar to id-mode) and
regenerate. If (c2) fails, fix the offending Code node — most often a stray `'` inside a Hebrew
prompt string (wrap inner labels in `«…»`, or make the string a backtick template literal) — and
regenerate. These are the highest-value checks added from real debugging.

## 6. Report

Print a short summary: node count, "broken refs: NONE", agents and their model links, node-type
counts. This is what you show the user as evidence the workflow is sound before they import it.

If any check fails, fix the builder and regenerate — do not patch the JSON by hand, which
reintroduces the inconsistency the builder was preventing.
