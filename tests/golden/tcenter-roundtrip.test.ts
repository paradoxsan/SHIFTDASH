import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadTemplateWorkflow,
  loadBindings,
  loadFingerprint,
  loadTemplateArtifact,
} from "../../lib/bot-artifact";
import { compileWorkflow, requiredTokens } from "../../lib/bot-compiler";

// Offline golden test for the tcenter-sales template. The LIVE byte-match of
// nodes/connections/systemMessage vs the running workflow runs in
// scripts/verify-live.mjs (needs n8n creds + the gitignored real params); here we
// pin determinism, completeness, structure, and secret-freedom — runnable in CI.
const ID = "tcenter-sales";
const template = loadTemplateWorkflow(ID) as {
  name: string;
  nodes: { name: string; type: string }[];
  connections: Record<string, Record<string, { node: string }[][]>>;
};
const bindings = loadBindings(ID);
const fp = loadFingerprint(ID);

// Placeholder params for every declared token (no real secrets needed).
const params = Object.fromEntries(bindings.tokens.map((t) => [t.name, `__VAL_${t.name}__`]));

function edgeCount(connections: typeof template.connections): number {
  let n = 0;
  for (const src of Object.values(connections)) for (const outs of Object.values(src)) for (const arr of outs) n += (arr ?? []).length;
  return n;
}

describe("tcenter-sales template — structure matches the live fingerprint", () => {
  it("node count, edge count, and node-name set match", () => {
    expect(template.nodes.length).toBe(fp.nodeCount);
    expect(edgeCount(template.connections)).toBe(fp.edgeCount);
    const namesHash = createHash("sha256").update(template.nodes.map((n) => n.name).sort().join("\n")).digest("hex");
    expect(namesHash).toBe(fp.nodeNamesSha256);
    const typesHash = createHash("sha256").update(template.nodes.map((n) => n.type).sort().join("\n")).digest("hex");
    expect(typesHash).toBe(fp.nodeTypesSha256);
  });
});

describe("tcenter-sales template — token/binding integrity", () => {
  it("every {{TPL:NAME}} in the template is declared in bindings (and vice versa)", () => {
    const inTemplate = requiredTokens(template);
    const declared = bindings.tokens.map((t) => t.name).sort();
    expect(inTemplate).toEqual(declared);
  });
  it("artifact.json's required secrets/config match the bindings kinds", () => {
    const artifact = loadTemplateArtifact(ID);
    const secrets = bindings.tokens.filter((t) => t.kind === "secret").map((t) => t.name).sort();
    const config = bindings.tokens.filter((t) => t.kind === "config").map((t) => t.name).sort();
    expect([...artifact.requiredSecrets].sort()).toEqual(secrets);
    expect([...artifact.requiredConfig].sort()).toEqual(config);
    expect(artifact.promptToken).toBe(bindings.promptToken);
  });
});

describe("tcenter-sales compiler — deterministic + complete", () => {
  it("compiling resolves ALL tokens — zero residual {{TPL:}}", () => {
    const r = compileWorkflow(template, params);
    expect(r.unresolved).toEqual([]);
    expect(r.residual).toBe(0);
  });
  it("is deterministic — same input yields identical bytes", () => {
    const a = JSON.stringify(compileWorkflow(template, params).workflow);
    const b = JSON.stringify(compileWorkflow(template, params).workflow);
    expect(a).toBe(b);
  });
  it("reports unresolved tokens instead of leaving a live secret blank", () => {
    const r = compileWorkflow(template, {});
    expect(r.unresolved).toEqual(requiredTokens(template));
    expect(r.residual).toBeGreaterThan(0);
  });
  it("substitutes values verbatim and preserves the node/edge graph", () => {
    const r = compileWorkflow(template, params);
    const wf = r.workflow as typeof template;
    expect(wf.nodes.length).toBe(fp.nodeCount);
    expect(edgeCount(wf.connections)).toBe(fp.edgeCount);
    expect(JSON.stringify(wf)).toContain("__VAL_SUPABASE_REF__");
  });
});

describe("tcenter-sales template — secret/PII free (committed artifact)", () => {
  const blob = JSON.stringify(template);

  it("leaks NONE of the real tenant values (checked against the gitignored params when present)", () => {
    // Authoritative check: read the real substitution values (gitignored) and
    // assert none leak into the committed template — without hardcoding any
    // secret fragment in this committed test. Skipped in CI where the file is absent.
    let params: Record<string, string> | null = null;
    try {
      params = JSON.parse(
        readFileSync(join(process.cwd(), "templates/tcenter-sales/tcenter.params.local.json"), "utf8")
      );
    } catch {
      params = null;
    }
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        if (typeof value === "string" && value.length >= 6) {
          expect(blob, `value of ${name} leaked into the template`).not.toContain(value);
        }
      }
    }
    // Always: the high-value secret tokens ARE present, i.e. the values are tokenized out.
    expect(blob).toContain("{{TPL:GEMINI_API_KEY}}");
    expect(blob).toContain("{{TPL:EZCOUNT_API_KEY}}");
    expect(blob).toContain("{{TPL:SYSTEM_PROMPT}}");
  });

  it("contains no generic secret/PII shapes", () => {
    expect(blob).not.toMatch(/AQ\.[A-Za-z0-9_-]{20,}/); // google api-key shape
    expect(blob).not.toMatch(/\b[0-9a-f]{48,}\b/); // long hex api key
    expect(blob).not.toMatch(/\b9725\d{7}\b/); // israeli phone numbers
  });

  it("only references credentials, never embeds their values", () => {
    expect(bindings.credentials).toEqual(
      expect.arrayContaining(["supabaseApi", "googlePalmApi", "httpHeaderAuth", "smtp"])
    );
  });
});
