import { describe, it, expect, vi } from "vitest";

// Mock the control-plane write path so the audit insert is a no-op in tests.
vi.mock("../../lib/supabase-management", () => ({ runSql: vi.fn().mockResolvedValue([]) }));
vi.mock("../../lib/control-plane", () => ({ controlPlaneRef: () => "cp" }));

import { auditedMutation } from "../../lib/services/audited";
import { ForbiddenError } from "../../lib/rbac";

describe("auditedMutation (Phase 3 enforcement point)", () => {
  it("runs the mutation for a permitted role", async () => {
    const fn = vi.fn().mockResolvedValue("done");
    const out = await auditedMutation(
      { actor: { email: "a@b.com", role: "operator" }, minRole: "operator", action: "x" },
      fn
    );
    expect(out).toBe("done");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("denies and never runs the mutation for an under-privileged role", async () => {
    const fn = vi.fn();
    await expect(
      auditedMutation({ actor: { email: "v@b.com", role: "viewer" }, minRole: "operator", action: "x" }, fn)
    ).rejects.toThrow(ForbiddenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it("denies when there is no actor", async () => {
    const fn = vi.fn();
    await expect(
      auditedMutation({ actor: null, minRole: "viewer", action: "x" }, fn)
    ).rejects.toThrow(ForbiddenError);
    expect(fn).not.toHaveBeenCalled();
  });
});
