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
  if (
    t.includes("int") ||
    t.includes("numeric") ||
    t.includes("double") ||
    t.includes("real") ||
    t.includes("decimal")
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
