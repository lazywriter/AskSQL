import "server-only";

export type ColumnType = "INTEGER" | "REAL" | "TEXT";

export interface ParsedTable {
  name: string;
  columns: { name: string; type: ColumnType }[];
  rows: (string | number | null)[][];
}

export const MAX_COLUMNS = 200;

/** RFC 4180-ish parser: quoted fields, "" escapes, CRLF/LF, and a delimiter sniffed from the header line. */
function parseRecords(text: string): string[][] {
  text = text.replace(/^﻿/, "");
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const delimiter = [",", ";", "\t", "|"].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );

  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || record.length) {
    record.push(field);
    records.push(record);
  }
  // Skip blank lines.
  return records.filter((r) => r.some((f) => f.trim() !== ""));
}

/** Lower snake_case SQL identifier; never empty, never starts with a digit. */
export function toIdentifier(raw: string, fallback: string): string {
  const id = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!id) return fallback;
  return /^[0-9]/.test(id) ? `_${id}` : id;
}

const INTEGER = /^[-+]?\d+$/;
const REAL = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
// Values like zip codes or IDs with leading zeros must stay text.
const LEADING_ZERO = /^[-+]?0\d/;

function inferType(values: string[]): ColumnType {
  let type: ColumnType = "INTEGER";
  let seen = false;
  for (const v of values) {
    if (v === "") continue;
    seen = true;
    if (LEADING_ZERO.test(v)) return "TEXT";
    if (type === "INTEGER" && !(INTEGER.test(v) && Number.isSafeInteger(Number(v)))) type = "REAL";
    if (type === "REAL" && !REAL.test(v)) return "TEXT";
  }
  return seen ? type : "TEXT";
}

export function parseCsv(text: string, tableName: string): ParsedTable {
  const [header, ...body] = parseRecords(text);
  if (!header) throw new Error("The file is empty.");
  if (header.length > MAX_COLUMNS) throw new Error(`Too many columns (max ${MAX_COLUMNS}).`);
  if (body.length === 0) throw new Error("The file has a header row but no data.");

  // Pad or cut ragged rows to the header width.
  const width = header.length;
  const cells = body.map((r) => Array.from({ length: width }, (_, i) => (r[i] ?? "").trim()));

  const used = new Set<string>();
  const columns = header.map((h, i) => {
    const base = toIdentifier(h, `column_${i + 1}`);
    let name = base;
    for (let n = 2; used.has(name); n++) name = `${base}_${n}`;
    used.add(name);
    return { name, type: inferType(cells.map((r) => r[i])) };
  });

  const rows = cells.map((r) =>
    r.map((v, i) => (v === "" ? null : columns[i].type === "TEXT" ? v : Number(v))),
  );
  return { name: tableName, columns, rows };
}
