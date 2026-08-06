import { describe, it, expect } from "vitest";
import { sameCustomerIds } from "@/lib/services/client-cards";

// The real duplicates in the live Morning account: one customer, two records,
// with receipts split between them. A contract can only link to one id.
const LIVE = new Map<string, string>([
  ["12ad7b0f", "טי סנטר"],
  ["53a36cb9", "טי סנטר"],
  ["bee9e156", "Br jewlery"],
  ["5f23566d", "Br jewlery"],
  ["4789ead7", "שביט מימון"],
]);

describe("sameCustomerIds", () => {
  it("collects every Morning record with the linked customer's name", () => {
    expect([...sameCustomerIds("53a36cb9", LIVE)].sort()).toEqual(["12ad7b0f", "53a36cb9"]);
    expect([...sameCustomerIds("5f23566d", LIVE)].sort()).toEqual(["5f23566d", "bee9e156"]);
  });

  it("does not drag in a different customer", () => {
    expect([...sameCustomerIds("4789ead7", LIVE)]).toEqual(["4789ead7"]);
  });

  it("matches whichever duplicate the contract happened to link to", () => {
    expect(sameCustomerIds("12ad7b0f", LIVE)).toEqual(sameCustomerIds("53a36cb9", LIVE));
  });

  it("ignores case and stray whitespace between the records", () => {
    const messy = new Map([
      ["a", "  T  Center "],
      ["b", "t center"],
      ["c", "someone else"],
    ]);
    expect([...sameCustomerIds("a", messy)].sort()).toEqual(["a", "b"]);
  });

  it("falls back to the id alone when the name is unknown or blank", () => {
    expect([...sameCustomerIds("missing", LIVE)]).toEqual(["missing"]);
    // A blank name must not sweep in every other blank-named record.
    const blanks = new Map([
      ["x", "   "],
      ["y", ""],
    ]);
    expect([...sameCustomerIds("x", blanks)]).toEqual(["x"]);
  });
});
