import { describe, it, expect } from "vitest";
import {
  buildSelect,
  buildUpdateByPk,
  buildWhere,
  assertOp,
  QueryBuilderError,
} from "../../lib/services/query-builder";
import type { ProjectSchema } from "../../lib/supabase-management";

// A hand-built schema so the allowlist logic is testable without live SQL.
const schema: ProjectSchema = {
  tables: {
    orders: [
      { name: "id", type: "uuid" },
      { name: "status", type: "text" },
      { name: "total", type: "numeric" },
      { name: "created_at", type: "timestamptz" },
    ],
    logs: [
      { name: "msg", type: "text" }, // no primary key
    ],
  },
  tableNames: ["orders", "logs"],
  pks: { orders: ["id"], logs: [] },
};

describe("query-builder — operation allowlist", () => {
  it("accepts only allowlisted ops", () => {
    expect(() => assertOp("select")).not.toThrow();
    expect(() => assertOp("update_by_pk")).not.toThrow();
  });
  it("rejects out-of-allowlist ops (delete/insert/drop)", () => {
    for (const bad of ["delete", "insert", "drop", "truncate", "update"]) {
      expect(() => assertOp(bad)).toThrow(QueryBuilderError);
    }
  });
});

describe("query-builder — buildSelect identifier allowlist", () => {
  it("builds a PK-ordered, bounded SELECT for a known table", () => {
    const sql = buildSelect(schema, "orders", { limit: 10, offset: 5 });
    expect(sql).toContain('from public."orders"');
    expect(sql).toContain('order by "created_at" desc');
    expect(sql).toContain("limit 10 offset 5");
  });
  it("rejects an unknown table", () => {
    expect(() => buildSelect(schema, "secrets")).toThrow(/unknown table/);
  });
  it("rejects an unknown column", () => {
    expect(() => buildSelect(schema, "orders", { columns: ["id", "ssn"] })).toThrow(/unknown column/);
  });
  it("clamps limit to a sane maximum", () => {
    expect(buildSelect(schema, "orders", { limit: 999999 })).toContain("limit 500");
  });
  it("truncates large text/json columns when asked", () => {
    const sql = buildSelect(schema, "orders", { truncateText: true });
    expect(sql).toContain('left("status", 300)');
  });
});

describe("query-builder — buildUpdateByPk (PK-scoped, value-bound)", () => {
  it("builds a PK-scoped UPDATE with typed, bound values", () => {
    const plan = buildUpdateByPk(schema, "orders", { id: "abc" }, { status: "paid", total: 42 });
    expect(plan.columns).toEqual(["status", "total"]);
    expect(plan.sql).toBe(
      `update public."orders" set "status" = 'paid', "total" = 42 where "id" = 'abc'::uuid`
    );
  });
  it("escapes quotes in values (no breakout)", () => {
    const plan = buildUpdateByPk(schema, "orders", { id: "x" }, { status: "o'brien" });
    expect(plan.sql).toContain("'o''brien'");
  });
  it("rejects updating a table with no primary key", () => {
    expect(() => buildUpdateByPk(schema, "logs", {}, { msg: "x" })).toThrow(/no primary key/);
  });
  it("rejects a missing primary-key value", () => {
    expect(() => buildUpdateByPk(schema, "orders", {}, { status: "x" })).toThrow(/missing primary-key/);
  });
  it("rejects an unknown column in the SET clause", () => {
    expect(() => buildUpdateByPk(schema, "orders", { id: "x" }, { ssn: "leak" })).toThrow(/unknown column/);
  });
  it("never lets a PK column be overwritten", () => {
    // Only the PK is provided as a settable column → nothing left to update.
    expect(() => buildUpdateByPk(schema, "orders", { id: "x" }, { id: "y" })).toThrow(/no updatable columns/);
  });
});

describe("query-builder — buildWhere (allowlisted predicates, bound values)", () => {
  it("binds eq with the column's type", () => {
    expect(buildWhere(schema, "orders", [{ column: "status", op: "eq", value: "open" }])).toBe(
      `"status" = 'open'`
    );
  });
  it("renders an IN list, each value bound", () => {
    expect(
      buildWhere(schema, "orders", [{ column: "status", op: "in", value: ["failed", "error"] }])
    ).toBe(`"status" in ('failed', 'error')`);
  });
  it("renders null checks without a value", () => {
    expect(buildWhere(schema, "orders", [{ column: "total", op: "is_null" }])).toBe(`"total" is null`);
    expect(buildWhere(schema, "orders", [{ column: "total", op: "not_null" }])).toBe(
      `"total" is not null`
    );
  });
  it("AND-joins multiple predicates", () => {
    const w = buildWhere(schema, "orders", [
      { column: "status", op: "eq", value: "open" },
      { column: "total", op: "gt", value: 100 },
    ]);
    expect(w).toBe(`"status" = 'open' and "total" > 100`);
  });
  it("rejects an unknown column in a predicate", () => {
    expect(() => buildWhere(schema, "orders", [{ column: "ssn", op: "eq", value: 1 }])).toThrow(
      /unknown column/
    );
  });
  it("rejects an empty IN list", () => {
    expect(() => buildWhere(schema, "orders", [{ column: "status", op: "in", value: [] }])).toThrow(
      /non-empty array/
    );
  });
  it("escapes quotes in predicate values (no breakout)", () => {
    expect(buildWhere(schema, "orders", [{ column: "status", op: "eq", value: "x' or '1'='1" }])).toBe(
      `"status" = 'x'' or ''1''=''1'`
    );
  });
  it("buildSelect composes a WHERE clause without collapsing value whitespace", () => {
    const sql = buildSelect(schema, "orders", {
      where: [{ column: "status", op: "eq", value: "a  b" }],
      limit: 5,
    });
    expect(sql).toContain(`where "status" = 'a  b'`);
    expect(sql).toContain("limit 5");
  });
});
