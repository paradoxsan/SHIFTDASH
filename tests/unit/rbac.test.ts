import { describe, it, expect } from "vitest";
import { permits, requireRole, ForbiddenError } from "../../lib/rbac";

describe("rbac (Phase 3)", () => {
  it("permits by privilege rank (owner ⊃ operator ⊃ viewer)", () => {
    expect(permits("owner", "operator")).toBe(true);
    expect(permits("operator", "operator")).toBe(true);
    expect(permits("operator", "owner")).toBe(false);
    expect(permits("viewer", "operator")).toBe(false);
    expect(permits("viewer", "viewer")).toBe(true);
    expect(permits(null, "viewer")).toBe(false);
  });

  it("requireRole throws ForbiddenError when under-privileged", () => {
    expect(() => requireRole("viewer", "operator")).toThrow(ForbiddenError);
    expect(() => requireRole(null, "viewer")).toThrow(ForbiddenError);
    expect(() => requireRole("owner", "owner")).not.toThrow();
    expect(() => requireRole("operator", "viewer")).not.toThrow();
  });
});
