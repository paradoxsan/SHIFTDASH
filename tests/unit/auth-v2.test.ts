import { describe, it, expect } from "vitest";
import {
  createSessionToken,
  createSessionTokenV2,
  getSession,
  verifySessionToken,
} from "../../lib/auth";

describe("v2 identity session (Phase 3)", () => {
  it("round-trips email + role", async () => {
    const t = await createSessionTokenV2({ email: "a@b.com", role: "operator" });
    expect(t.startsWith("v2.")).toBe(true);
    expect(await verifySessionToken(t)).toBe(true);
    expect(await getSession(t)).toEqual({ email: "a@b.com", role: "operator" });
  });

  it("rejects a tampered v2 token", async () => {
    const t = await createSessionTokenV2({ email: "a@b.com", role: "owner" });
    const bad = t.slice(0, -1) + (t.endsWith("A") ? "B" : "A");
    expect(await getSession(bad)).toBeNull();
    expect(await verifySessionToken(bad)).toBe(false);
  });

  it("treats a valid legacy v1 token as a transitional owner", async () => {
    const v1 = await createSessionToken();
    expect(await verifySessionToken(v1)).toBe(true);
    expect((await getSession(v1))?.role).toBe("owner");
  });

  it("returns null for garbage", async () => {
    expect(await getSession("nonsense")).toBeNull();
    expect(await getSession(undefined)).toBeNull();
  });
});
