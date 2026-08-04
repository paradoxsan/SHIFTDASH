import { describe, it, expect } from "vitest";
import { tablePatchSchema } from "../../lib/validation/table-patch";

describe("tablePatchSchema (boundary validation for the DB-explorer PATCH)", () => {
  it("accepts a valid pk + set body", () => {
    const r = tablePatchSchema.safeParse({ pk: { id: 5 }, set: { status: "new" } });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.pk).toEqual({ id: 5 });
      expect(r.data.set).toEqual({ status: "new" });
    }
  });

  it("defaults missing pk/set to empty objects (preserves prior behavior)", () => {
    const r = tablePatchSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.pk).toEqual({});
      expect(r.data.set).toEqual({});
    }
  });

  it("rejects non-object bodies", () => {
    expect(tablePatchSchema.safeParse("nope").success).toBe(false);
    expect(tablePatchSchema.safeParse(42).success).toBe(false);
    expect(tablePatchSchema.safeParse(null).success).toBe(false);
  });
});
