// Types shared by the API routes and the browser.

export type Row = Record<string, unknown>;

export interface ChartSpec {
  type: "bar" | "line" | "pie" | "table";
  x: string;
  y: string[];
  title: string;
}

export interface HistoryTurn {
  question: string;
  sql: string;
}

export interface QueryResult {
  question: string;
  sql: string;
  explanation: string;
  chart: ChartSpec;
  columns: string[];
  rows: Row[];
  truncated: boolean;
  attempts: number;
}

export interface TableInfo {
  name: string;
  columns: { name: string; type: string }[];
}
