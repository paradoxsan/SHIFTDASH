# Researching nodes before building

n8n moves fast: native nodes are added regularly, parameter names change between type versions, and a
large share of real-world capability lives in community nodes that aren't installed by default.
Building from memory is the main cause of broken workflows — a misremembered node type, a guessed
parameter name, or assuming raw HTTP when a clean node exists. Spend a minute researching first.

## What to research, in order

### 1. Does a native node exist?
Before reaching for a raw HTTP Request node, check whether n8n already has a first-class node for the
service. There are far more than people expect.

- **n8n docs integrations index:** `https://docs.n8n.io/integrations/`
- **Specific node page:** `https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.<name>/`
  — gives the exact type string, the operations/resources, and parameter notes.
- Web-search pattern: `n8n <service> node docs` or `site:docs.n8n.io <service>`.

A native node is preferable to raw HTTP when it exists: it handles auth via a credential, exposes
clean operations, and is more stable. Example: the **Facebook Graph API node**
(`n8n-nodes-base.facebookGraphApi`) is native and posts to any node/edge — better than hand-rolling
Graph API calls.

Some native nodes are also usable as AI-agent tools (the docs note "This node can be used to enhance
the capabilities of an AI agent"). Check for that when building agent workflows.

### 2. Is there a community node?
When there's no native node — or when a dedicated node would collapse a messy multi-step flow into
one clean node — look for a community node.

- **npm search:** `https://www.npmjs.com/search?q=n8n-nodes-<service>`
- **GitHub search:** `n8n-nodes-<service>` — the README usually documents resources, operations, and
  the exact node type string.
- Web-search pattern: `n8n community node <service> publish` or `"n8n-nodes-<service>"`.

Community nodes frequently wrap complicated API choreography. Example: `n8n-nodes-instagram`
(MookieLian) exposes Resource `Image`/`Reels`/`Stories`/`Carousel` with Operation `Publish`, and
internally does the Instagram container→poll→publish flow that would otherwise be 3-4 manual nodes.

**Always flag community nodes in delivery.** They require the user to install the package on a
self-hosted instance (Settings → Community Nodes), and they need n8n with community nodes enabled.
Note the npm package name so the user knows exactly what to install.

### 3. Verify the exact type string and parameters
Before writing a node into the builder, confirm:

- **Type string.** Native = `n8n-nodes-base.<name>`. Community =
  `<package-node-name>.<node>` (read it from the README/npm — don't guess; the short name often
  differs from the package name).
- **Parameters.** The resource/operation names and field names as the node actually expects them.
  Wrong parameter names import as empty fields. When unsure, note it and tell the user to open the
  node and pick Resource/Operation from the dropdown after import.
- **typeVersion.** Use a current version. If the user's n8n might be older, warn that the node may
  need re-selecting.

### 4. Verify AI/LangChain specifics
For agent workflows, the most common break is connection types. Confirm against current docs:

- Agent node: `@n8n/n8n-nodes-langchain.agent`, current `typeVersion`.
- Sub-node connection types: `ai_languageModel`, `ai_memory`, `ai_tool` (never `main`).
- Memory: **Simple Memory** `@n8n/n8n-nodes-langchain.memoryBufferWindow` (the bot default — volatile,
  zero-setup) vs **Postgres Chat Memory** `memoryPostgresChat` (persistent, can sit on Supabase). See
  `references/supabase.md` for the persistent path.
- Vector store / RAG on Supabase: `@n8n/n8n-nodes-langchain.vectorStoreSupabase` + pgvector — see
  `references/supabase.md`.
- Tools: `toolWorkflow` (call a sub-workflow), `toolHttpRequest`, `toolCode`.
- Docs: `https://docs.n8n.io/integrations/builtin/cluster-nodes/` (root nodes + sub-nodes).

### 5. Use connected MCP tools when available
If the user has an n8n MCP connected, use it to ground the build in their actual instance:

- List existing workflows / read one to match credential ids and existing patterns.
- List available nodes to confirm a node is installed on their instance.
- Inspect an existing workflow's JSON to copy the exact node shapes their n8n version produces — this
  is the most reliable way to get version-correct schemas.

Reading one real workflow from the user's instance beats any doc for matching their exact node
versions and credential reference format.

## Rule of thumb
Treat any node you haven't personally verified recently as "verify before use." A 30-second web
search or one MCP call to the user's instance is always cheaper than shipping a workflow that fails
on import. Come to the confirm step already certain the nodes are real and correctly specified.
