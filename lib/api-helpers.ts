import { NextResponse } from "next/server";

export function ok(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function fail(e: unknown, status = 500): NextResponse {
  const message = e instanceof Error ? e.message : String(e);
  // Surface a readable message; details already logged server-side by the throw.
  return NextResponse.json({ error: message }, { status });
}
