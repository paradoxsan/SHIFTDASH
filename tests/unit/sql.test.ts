import { describe, it, expect } from "vitest";
import { sqlString, sqlValue } from "../../lib/sql";

describe("sqlString", () => {
  it("wraps a plain string in single quotes", () => {
    expect(sqlString("hello")).toBe("'hello'");
  });
  it("escapes single quotes by doubling them (injection guard)", () => {
    expect(sqlString("O'Brien")).toBe("'O''Brien'");
    expect(sqlString("'; drop table x; --")).toBe("'''; drop table x; --'");
  });
});

describe("sqlValue typing", () => {
  it("renders null for null/undefined/empty", () => {
    expect(sqlValue(null, "text")).toBe("null");
    expect(sqlValue(undefined, "text")).toBe("null");
    expect(sqlValue("", "text")).toBe("null");
  });
  it("renders booleans", () => {
    expect(sqlValue(true, "boolean")).toBe("true");
    expect(sqlValue("true", "bool")).toBe("true");
    expect(sqlValue("f", "boolean")).toBe("false");
    expect(sqlValue(0, "boolean")).toBe("false");
  });
  it("renders numerics unquoted and rejects NaN", () => {
    expect(sqlValue("42", "integer")).toBe("42");
    expect(sqlValue(3.5, "numeric")).toBe("3.5");
    expect(sqlValue("not-a-number", "int8")).toBe("null");
  });
  it("binds bigint PKs LOSSLESSLY — never round-trips through Number() (wrong-row guard)", () => {
    // > 2^53 must stay exact; Number() would collapse adjacent ids to one literal.
    expect(sqlValue("9007199254740993", "bigint")).toBe("9007199254740993");
    expect(sqlValue("9007199254740992", "bigint")).toBe("9007199254740992");
    expect(sqlValue("12345678901234567890", "bigint")).toBe("12345678901234567890");
    expect(sqlValue(7, "bigint")).toBe("7");
  });
  it("rejects non-canonical integer input for an integer column (no silent retarget)", () => {
    // These would otherwise coerce to a DIFFERENT integer (1e1→10, 0x10→16, 12.9→12).
    for (const bad of ["1e1", "0x10", "12.9", "5px", "Infinity"]) {
      expect(sqlValue(bad, "bigint")).toBe("null");
    }
    expect(sqlValue(12.9, "integer")).toBe("null"); // a non-integer number is not a valid int literal
    expect(sqlValue(" 5 ", "bigint")).toBe("5"); // surrounding whitespace is trimmed (lossless)
  });
  it("still renders true floats for numeric/decimal columns", () => {
    expect(sqlValue("350.50", "numeric")).toBe("350.5");
    expect(sqlValue(2.5, "double precision")).toBe("2.5");
  });
  it("casts json/timestamp/uuid with escaping", () => {
    expect(sqlValue('{"a":1}', "jsonb")).toBe("'{\"a\":1}'::jsonb");
    expect(sqlValue("2026-01-01", "timestamp with time zone")).toBe("'2026-01-01'::timestamptz");
    expect(sqlValue("11111111-1111-1111-1111-111111111111", "uuid")).toBe(
      "'11111111-1111-1111-1111-111111111111'::uuid"
    );
  });
  it("treats unknown/text types as escaped strings", () => {
    expect(sqlValue("O'Brien", "character varying")).toBe("'O''Brien'");
  });
});
