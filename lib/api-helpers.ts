import { NextResponse } from "next/server";
import type { ZodType } from "zod";

export function ok(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function fail(e: unknown, status = 500): NextResponse {
  const message = e instanceof Error ? e.message : String(e);
  // RBAC denials map to 403 regardless of the default status.
  const code = e instanceof Error && e.name === "ForbiddenError" ? 403 : status;
  // Surface a readable message; details already logged server-side by the throw.
  return NextResponse.json({ error: message }, { status: code });
}

// ── Zod request-body validation (BotOps Phase 1) ──────────────────────────────
// Validate at the system boundary. Returns the parsed value or a ready 400.
// Usage:
//   const parsed = await parseBody(req, schema);
//   if (!parsed.ok) return parsed.res;
//   const body = parsed.data;
export type ParseResult<T> = { ok: true; data: T } | { ok: false; res: NextResponse };

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<ParseResult<T>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { ok: false, res: fail("Invalid JSON body", 400) };
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    const msg = result.error.issues
      .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
      .join("; ");
    return { ok: false, res: fail(msg, 400) };
  }
  return { ok: true, data: result.data };
}
