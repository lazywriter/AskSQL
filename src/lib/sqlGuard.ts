// First line of defence against model-generated SQL doing anything but reading.
// The second line is the read-only SQLite connection in db.ts.

const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|replace|truncate|attach|detach|pragma|vacuum|reindex|analyze|begin|commit|rollback|savepoint|release|load_extension)\b/i;

export type GuardResult = { ok: true; sql: string } | { ok: false; reason: string };

export function guardSql(raw: string): GuardResult {
  // Drop comments, then a single trailing semicolon.
  const sql = raw
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .trim()
    .replace(/;\s*$/, "")
    .trim();

  if (!sql) return { ok: false, reason: "Empty query." };
  if (sql.includes(";")) return { ok: false, reason: "Only a single statement is allowed." };
  if (!/^(select|with)\b/i.test(sql)) return { ok: false, reason: "Only SELECT queries are allowed." };

  // Blank out string literals first so values like 'Create Account' don't trip the keyword check.
  const withoutStrings = sql.replace(/'(?:[^']|'')*'/g, "''");
  const hit = withoutStrings.match(FORBIDDEN);
  if (hit) return { ok: false, reason: `Keyword "${hit[1].toUpperCase()}" is not allowed.` };

  return { ok: true, sql };
}
