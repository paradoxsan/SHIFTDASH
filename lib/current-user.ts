// Resolve the current session from a request cookie (Node route handlers).
import { SESSION_COOKIE, getSession, type Session } from "./auth";

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return undefined;
}

export async function getCurrentUser(req: Request): Promise<Session | null> {
  return getSession(readCookie(req, SESSION_COOKIE));
}
