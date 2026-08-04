import { describe, it, expect } from "vitest";
import { guardSelect } from "../../lib/ai/nl-sql";

const allowed = ["orders", "inbox", "leads"];
const g = (sql: string) => guardSelect(sql, { allowedTables: allowed, maxRows: 1000 });

describe("nl-sql guard — accepts safe SELECTs", () => {
  it("passes a plain SELECT over an allowlisted table and caps rows", () => {
    const r = g("select status, total from orders where status = 'open'");
    expect(r.ok).toBe(true);
    expect(r.sql).toBe("select status, total from orders where status = 'open' limit 1000");
    expect(r.tables).toEqual(["orders"]);
  });
  it("keeps an existing LIMIT under the cap", () => {
    expect(g("select * from inbox limit 50").sql).toBe("select * from inbox limit 50");
  });
  it("lowers an over-large LIMIT to the cap", () => {
    expect(g("select * from inbox limit 999999").sql).toBe("select * from inbox limit 1000");
  });
  it("does NOT false-positive on column names containing keywords", () => {
    // created_at/updated_at/deleted_at/offset all CONTAIN forbidden keywords as substrings.
    const r = g("select created_at, updated_at from orders order by created_at desc offset 10");
    expect(r.ok).toBe(true);
  });
  it("allows joins across allowlisted tables", () => {
    const r = g("select o.total from orders o join leads l on l.id = o.chat_id");
    expect(r.ok).toBe(true);
    expect(r.tables?.sort()).toEqual(["leads", "orders"]);
  });
});

describe("nl-sql guard — rejects writes & injection (security acceptance)", () => {
  // The security guarantee is REJECTION (ok=false); the exact reason is secondary.
  const malicious = [
    "update orders set total = 0",
    "delete from orders",
    "drop table orders",
    "insert into orders (id) values (1)",
    "truncate orders",
    "alter table orders add column x int",
    "grant select on orders to public",
    "select * from orders; delete from orders",
    "select * from orders -- drop",
    "select * from orders /* x */",
    "select * from orders into outfile '/tmp/x'",
    "update leads set status='x' returning *",
    "SELECT * FROM orders; DROP TABLE orders;",
  ];
  for (const sql of malicious) {
    it(`rejects: ${sql.slice(0, 42)}`, () => {
      expect(g(sql).ok).toBe(false);
    });
  }

  it("reports a specific reason for the key injection shapes", () => {
    expect(g("select * from orders; delete from orders").reason).toMatch(/multiple statements/);
    expect(g("select * from orders -- x").reason).toMatch(/comment/);
    expect(g("select * from orders into outfile '/x'").reason).toMatch(/into/);
    expect(g("delete from orders").reason).toMatch(/only SELECT/);
  });

  it("rejects a SELECT against a non-allowlisted table", () => {
    const r = g("select * from app_users");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not allowed: app_users/);
  });
  it("catches a comma-join smuggling an un-allowlisted table (allowlist bypass)", () => {
    const r = g("select * from inbox, app_users");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not allowed: app_users/);
  });
  it("catches an un-allowlisted JOIN target", () => {
    expect(g("select * from orders o join app_users u on u.id = o.chat_id").ok).toBe(false);
  });
  it("still allows an aliased comma-join across allowlisted tables", () => {
    expect(g("select o.total from orders o, leads l where l.id = o.chat_id").ok).toBe(true);
  });
  it("rejects system catalog access", () => {
    expect(g("select * from pg_catalog.pg_tables").ok).toBe(false);
    expect(g("select * from information_schema.columns").ok).toBe(false);
  });
  it("rejects a non-SELECT or empty query", () => {
    expect(g("with x as (delete from orders returning *) select * from x").ok).toBe(false);
    expect(g("").ok).toBe(false);
    expect(g("   ").ok).toBe(false);
  });
});
