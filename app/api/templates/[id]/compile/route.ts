import { ok, fail } from "@/lib/api-helpers";
import { loadTemplateWorkflow, loadBindings } from "@/lib/bot-artifact";
import { compileWorkflow, requiredTokens, workflowHash } from "@/lib/bot-compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Compile a template with ZERO side effects (no DB write, no n8n call, no secret
// fetch). Uses placeholder values, so the response never contains real secrets.
// Deploy (live PUT) is Phase 7; this route is dry-run only.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const dryRun = new URL(req.url).searchParams.get("dryRun") !== "false";
    if (!dryRun) {
      return fail(new Error("only dryRun compile is supported here — deploy lands in Phase 7"), 400);
    }

    let template: unknown;
    let bindings;
    try {
      template = loadTemplateWorkflow(id);
      bindings = loadBindings(id);
    } catch {
      return fail(new Error(`Unknown template: ${id}`), 404);
    }

    // Placeholder params for every token — no real secrets, no resolution gaps.
    const placeholders = Object.fromEntries(requiredTokens(template).map((n) => [n, `__DRYRUN_${n}__`]));
    const result = compileWorkflow(template, placeholders);
    const wf = result.workflow as {
      nodes?: unknown[];
      connections?: Record<string, Record<string, unknown[][]>>;
    };
    let edges = 0;
    for (const src of Object.values(wf.connections ?? {})) for (const outs of Object.values(src)) for (const arr of outs) edges += (arr ?? []).length;

    return ok({
      templateId: id,
      dryRun: true,
      nodeCount: wf.nodes?.length ?? 0,
      edgeCount: edges,
      tokens: bindings.tokens.map((t) => ({ name: t.name, kind: t.kind })),
      requiredSecrets: bindings.requiredSecrets,
      requiredConfig: bindings.requiredConfig,
      unresolved: result.unresolved,
      residual: result.residual,
      compiledHash: workflowHash(result.workflow),
    });
  } catch (e) {
    return fail(e);
  }
}
