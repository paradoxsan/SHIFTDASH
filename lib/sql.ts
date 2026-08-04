// Safe SQL literal builders for the Management SQL endpoint. We validate table
// and column identifiers against live introspection before interpolating, and
// every user value passes through here so quotes can't break out of a literal.

export function sqlString(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

/** Render a JS value as a typed SQL literal based on the column's data type. */
export function sqlValue(v: unknown, dataType: string): string {
  if (v === null || v === undefined || v === "") return "null";
  const t = dataType.toLowerCase();

  if (t.includes("bool")) {
    return v === true || v === "true" || v === "t" || v === 1 ? "true" : "false";
  }
  // Integer types (integer/bigint/smallint/int2|4|8/serial): bind a CANONICAL
  // base-10 integer VERBATIM. Never round-trip through Number() — that loses
  // precision above 2^53 (a bigint PK could then match the wrong row) and would
  // silently accept "1e1"/"0x10"/"12.9". Non-canonical input → null (no match).
  if (/^(small|big)?int(eger)?$/.test(t) || /^int[248]$/.test(t) || /serial$/.test(t)) {
    if (typeof v === "number") return Number.isInteger(v) ? String(v) : "null";
    const s = String(v).trim();
    return /^-?\d+$/.test(s) ? s : "null";
  }
  // Floating / arbitrary-precision numerics (numeric/decimal/double/real/float).
  if (
    t.includes("numeric") ||
    t.includes("double") ||
    t.includes("real") ||
    t.includes("decimal") ||
    t.includes("float")
  ) {
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : "null";
  }
  if (t.includes("json")) return `${sqlString(String(v))}::jsonb`;
  if (t.includes("timestamp") || t === "date") return `${sqlString(String(v))}::timestamptz`;
  if (t.includes("uuid")) return `${sqlString(String(v))}::uuid`;
  // text / varchar / char / enum / everything else
  return sqlString(String(v));
}
