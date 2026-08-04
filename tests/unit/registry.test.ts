import { describe, it, expect } from "vitest";
import {
  getClient,
  clientTables,
  workflowMatchesClient,
  clientsByWorkspace,
  assertKnownRef,
  knownRefs,
} from "../../lib/registry";
import { ForbiddenError } from "../../lib/rbac";

describe("registry resolution (pre-DB baseline — must stay stable in Phase 2)", () => {
  it("resolves a known client and returns null for unknown", () => {
    expect(getClient("t-center")?.name).toBe("T center");
    expect(getClient("nope")).toBeNull();
  });

  it("clientTables honors excludeTables (brjewelry)", () => {
    const c = getClient("brjewelry")!;
    const all = ["leads", "inbox", "activities", "media_sent", "app_config"];
    expect(clientTables(c, all)).toEqual(["inbox", "media_sent", "app_config"]);
  });

  it("clientTables honors include list (shift-digital)", () => {
    const c = getClient("shift-digital")!;
    const all = ["leads", "inbox", "activities", "app_config"];
    expect(clientTables(c, all)).toEqual(["leads", "activities", "app_config"]);
  });

  it("workflowMatchesClient matches by prefix, case-insensitive", () => {
    const tc = getClient("t-center")!;
    expect(workflowMatchesClient(tc, "T-CENTER Sales bot V2.9.2")).toBe(true);
    expect(workflowMatchesClient(tc, "SDR Agent (Hebrew)")).toBe(false);
  });

  it("groups clients by workspace", () => {
    expect(clientsByWorkspace("mine").map((c) => c.id)).toContain("shift-digital");
    expect(clientsByWorkspace("clients").map((c) => c.id)).toEqual(
      expect.arrayContaining(["brjewelry", "t-center"])
    );
  });
});

describe("assertKnownRef (cross-project access guard)", () => {
  it("knownRefs contains exactly the managed data-plane refs", () => {
    expect(knownRefs()).toEqual(new Set(["kracmhwzmgligxngmhmi", "xrvrjcnxogplmoybppay"]));
  });
  it("accepts a known project ref", () => {
    expect(() => assertKnownRef("kracmhwzmgligxngmhmi")).not.toThrow();
    expect(() => assertKnownRef("xrvrjcnxogplmoybppay")).not.toThrow();
  });
  it("throws ForbiddenError for an arbitrary/other-org project ref", () => {
    expect(() => assertKnownRef("someoneelsesproject")).toThrow(ForbiddenError);
    expect(() => assertKnownRef("")).toThrow(ForbiddenError);
  });
});
