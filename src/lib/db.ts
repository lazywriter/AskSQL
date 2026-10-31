import "server-only";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { ParsedTable } from "./csv";
import type { Row, TableInfo } from "./types";

export const MAX_ROWS = 500;
const MAX_DATASETS = 20;

let db: DatabaseSync | null = null;

// Read-only connection: even if a write statement slipped past the guard, SQLite refuses it.
function getDefaultDb(): DatabaseSync {
  if (!db) {
    const file = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "shop.db");
    db = new DatabaseSync(file, { readOnly: true });
  }
  return db;
}

export class DatasetNotFoundError extends Error {
  constructor() {
    super("This uploaded dataset is no longer available (the server may have restarted). Upload the file again.");
  }
}

// Uploaded CSVs live in memory, keyed by a random id. Kept on globalThis so dev hot reloads don't drop them.
const g = globalThis as typeof globalThis & { __datasets?: Map<string, DatabaseSync> };
const datasets = (g.__datasets ??= new Map());

function getDb(datasetId?: string): DatabaseSync {
  if (!datasetId) return getDefaultDb();
  const d = datasets.get(datasetId);
  if (!d) throw new DatasetNotFoundError();
  return d;
}

/** Loads parsed CSV tables into a fresh in-memory database and returns its id. */
export function createDataset(tables: ParsedTable[]): string {
  const d = new DatabaseSync(":memory:");
  d.exec("BEGIN");
  for (const t of tables) {
    const cols = t.columns.map((c) => `"${c.name}" ${c.type}`).join(", ");
    d.exec(`CREATE TABLE "${t.name}" (${cols})`);
    const insert = d.prepare(`INSERT INTO "${t.name}" VALUES (${t.columns.map(() => "?").join(", ")})`);
    for (const row of t.rows) insert.run(...row);
  }
  d.exec("COMMIT");
  // Same guarantee as the read-only file connection; the SQL guard blocks PRAGMA, so this can't be undone.
  d.exec("PRAGMA query_only = ON");

  const id = randomUUID();
  datasets.set(id, d);
  // Map keeps insertion order, so the first key is the oldest upload.
  while (datasets.size > MAX_DATASETS) {
    const oldest = datasets.keys().next().value!;
    datasets.get(oldest)!.close();
    datasets.delete(oldest);
  }
  return id;
}

function tableNames(d: DatabaseSync): string[] {
  return (
    d
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[]
  ).map((t) => t.name);
}

/** CREATE TABLE statements, used as the schema context for the model. */
export function getSchemaDDL(datasetId?: string): string {
  const rows = getDb(datasetId)
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { sql: string }[];
  return rows.map((r) => r.sql.trim() + ";").join("\n\n");
}

/** A few rows per table so the model can see value formats (dates, casing, units) in unfamiliar data. */
export function getSampleRows(datasetId?: string, n = 3): string {
  const d = getDb(datasetId);
  return tableNames(d)
    .map((name) => {
      const rows = d.prepare(`SELECT * FROM "${name}" LIMIT ${n}`).all();
      return `${name}:\n${rows.map((r) => JSON.stringify({ ...r })).join("\n")}`;
    })
    .join("\n\n");
}

export function getTables(datasetId?: string): TableInfo[] {
  const d = getDb(datasetId);
  return tableNames(d).map((name) => ({
    name,
    columns: (d.prepare(`PRAGMA table_info("${name}")`).all() as { name: string; type: string }[]).map((c) => ({
      name: c.name,
      type: c.type,
    })),
  }));
}

/** Runs an already-validated SELECT, capped at MAX_ROWS + 1 so we can tell if it was truncated. */
export function runQuery(sql: string, datasetId?: string): { columns: string[]; rows: Row[]; truncated: boolean } {
  const stmt = getDb(datasetId).prepare(`SELECT * FROM (${sql}) LIMIT ${MAX_ROWS + 1}`);
  // node:sqlite returns null-prototype objects; copy them into plain ones.
  const rows = stmt.all().map((r) => ({ ...r }) as Row);
  const columns = stmt.columns().map((c) => c.name);
  const truncated = rows.length > MAX_ROWS;
  return { columns, rows: truncated ? rows.slice(0, MAX_ROWS) : rows, truncated };
}
