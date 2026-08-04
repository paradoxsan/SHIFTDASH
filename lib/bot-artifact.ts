// ── Bot template / artifact contract (BotOps Phase 6) ─────────────────────────
// The canonical, versioned shapes a bot is produced from. A template lives on
// disk under templates/<id>/ (tokenized workflow + bindings + canonical DB
// migrations, all secret-free). A bot ARTIFACT is an immutable, content-hashed
// snapshot (workflow | prompt | schema) stored in the control-plane; an edit
// creates a NEW version (parentVersion link); rollback re-deploys a prior one.
import { z } from "zod";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

// ── Bindings manifest (templates/<id>/bindings.json) ──────────────────────────
export const bindingKind = z.enum(["secret", "config", "prompt"]);
export type BindingKind = z.infer<typeof bindingKind>;

export const bindingTokenSchema = z.object({
  token: z.string(), // e.g. "{{TPL:SUPABASE_REF}}"
  name: z.string(), // e.g. "SUPABASE_REF"
  kind: bindingKind,
  occurrences: z.number().int().nonnegative(),
  description: z.string().optional(),
});

export const bindingsSchema = z.object({
  templateId: z.string(),
  sourceWorkflowId: z.string(),
  tokens: z.array(bindingTokenSchema),
  requiredSecrets: z.array(z.string()),
  requiredConfig: z.array(z.string()),
  promptToken: z.string(),
  credentials: z.array(z.string()),
});
export type Bindings = z.infer<typeof bindingsSchema>;

// ── Template metadata (templates/<id>/artifact.json) ──────────────────────────
export const templateArtifactSchema = z.object({
  meta: z.object({
    id: z.string(),
    name: z.string(),
    version: z.number().int().positive(),
    sourceWorkflowId: z.string(),
    description: z.string().optional(),
  }),
  n8nTemplate: z.string(),
  bindings: z.string(),
  fingerprint: z.string().optional(),
  dbMigrations: z.array(z.string()),
  credentials: z.array(z.string()),
  requiredSecrets: z.array(z.string()),
  requiredConfig: z.array(z.string()),
  promptToken: z.string(),
});
export type TemplateArtifact = z.infer<typeof templateArtifactSchema>;

// ── Stored, versioned bot artifact (control-plane) ────────────────────────────
export const botArtifactKind = z.enum(["workflow", "prompt", "schema"]);
export const botArtifactSchema = z.object({
  kind: botArtifactKind,
  content: z.string(), // serialized workflow JSON / prompt text / SQL
  contentHash: z.string(),
  version: z.number().int().positive(),
  parentVersion: z.number().int().positive().nullable(),
});
export type BotArtifact = z.infer<typeof botArtifactSchema>;

export interface TemplateFingerprint {
  nodeCount: number;
  edgeCount: number;
  nodeNamesSha256: string;
  nodeTypesSha256: string;
  systemPromptLength: number;
  systemPromptSha256: string;
  credentials: string[];
}

// ── Helpers / loaders ─────────────────────────────────────────────────────────
export function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function templateDir(id: string): string {
  // templates/ ships with the app (NOT in .vercelignore) so server routes can read it.
  return join(process.cwd(), "templates", id);
}

export function loadTemplateArtifact(id: string): TemplateArtifact {
  return templateArtifactSchema.parse(
    JSON.parse(readFileSync(join(templateDir(id), "artifact.json"), "utf8"))
  );
}
export function loadTemplateWorkflow(id: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(templateDir(id), "workflow.template.json"), "utf8"));
}
export function loadBindings(id: string): Bindings {
  return bindingsSchema.parse(JSON.parse(readFileSync(join(templateDir(id), "bindings.json"), "utf8")));
}
export function loadFingerprint(id: string): TemplateFingerprint {
  return JSON.parse(readFileSync(join(templateDir(id), "fingerprint.json"), "utf8")) as TemplateFingerprint;
}
