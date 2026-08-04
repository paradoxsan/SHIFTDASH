import { describe, it, expect } from "vitest";
import { toCsv } from "../../lib/exports";
import { assembleHeatmap } from "../../lib/analytics";

describe("exports — toCsv", () => {
  it("renders a header + rows", () => {
    const csv = toCsv([{ a: 1, b: "x" }, { a: 2, b: "y" }]);
    expect(csv).toBe("a,b\n1,x\n2,y\n");
  });
  it("quotes fields with commas, quotes, or newlines and doubles inner quotes", () => {
    const csv = toCsv([{ name: "a,b", note: 'say "hi"', multi: "l1\nl2" }]);
    expect(csv).toContain('"a,b"');
    expect(csv).toContain('"say ""hi"""');
    expect(csv).toContain('"l1\nl2"');
  });
  it("serializes objects as JSON and blanks null/undefined", () => {
    const csv = toCsv([{ j: { x: 1 }, n: null, u: undefined }]);
    expect(csv).toContain('"{""x"":1}"');
    expect(csv.split("\n")[1]).toBe('"{""x"":1}",,');
  });
  it("respects an explicit column order and emits a header for empty rows", () => {
    expect(toCsv([{ a: 1, b: 2 }], ["b", "a"])).toBe("b,a\n2,1\n");
    expect(toCsv([], ["a", "b"])).toBe("a,b\n");
  });
});

describe("analytics — assembleHeatmap", () => {
  it("builds a 7×24 grid and reports max + total", () => {
    const r = assembleHeatmap([
      { dow: 0, hr: 9, n: 5 },
      { dow: 0, hr: 9, n: 3 }, // overwrites (last wins) — grouped input is unique in practice
      { dow: 6, hr: 23, n: 10 },
    ]);
    expect(r.heatmap.length).toBe(7);
    expect(r.heatmap[0].length).toBe(24);
    expect(r.heatmap[6][23]).toBe(10);
    expect(r.max).toBe(10);
  });
  it("ignores out-of-range or non-integer buckets", () => {
    const r = assembleHeatmap([
      { dow: 7, hr: 0, n: 99 }, // dow out of range
      { dow: 1, hr: 24, n: 99 }, // hr out of range
      { dow: 2, hr: 5, n: 4 },
    ]);
    expect(r.total).toBe(4);
    expect(r.max).toBe(4);
    expect(r.heatmap[2][5]).toBe(4);
  });
  it("handles an empty input", () => {
    const r = assembleHeatmap([]);
    expect(r.max).toBe(0);
    expect(r.total).toBe(0);
    expect(r.heatmap.flat().every((x) => x === 0)).toBe(true);
  });
});
