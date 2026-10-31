"use client";

import { useState } from "react";
import ResultChart, { canChart } from "./ResultChart";
import type { QueryResult, Row } from "@/lib/types";

type View = "chart" | "table" | "sql";

const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return num.format(v);
  return String(v);
}

function toCsv(columns: string[], rows: Row[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map(esc).join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n");
}

export default function ResultCard({ result }: { result: QueryResult }) {
  const chartable = canChart(result.chart, result.columns, result.rows);
  const [view, setView] = useState<View>(chartable ? "chart" : "table");
  const [copied, setCopied] = useState(false);

  // A single-row, single-column answer reads best as a big number.
  const single =
    result.rows.length === 1 && result.columns.length === 1 ? result.rows[0][result.columns[0]] : undefined;

  const copySql = async () => {
    await navigator.clipboard.writeText(result.sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const downloadCsv = () => {
    const blob = new Blob([toCsv(result.columns, result.rows)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${result.chart.title || "result"}.csv`.replace(/[^\w.-]+/g, "_");
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const tabs: View[] = chartable ? ["chart", "table", "sql"] : ["table", "sql"];

  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{result.question}</p>
          <h2 className="mt-1 text-lg font-semibold">{result.chart.title || "Result"}</h2>
          <p className="mt-1 text-sm text-muted">{result.explanation}</p>
        </div>
        <div className="flex shrink-0 rounded-lg border border-border p-0.5 text-sm">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setView(t)}
              className={`rounded-md px-3 py-1 capitalize transition ${view === t ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-foreground"}`}
            >
              {t === "sql" ? "SQL" : t}
            </button>
          ))}
        </div>
      </header>

      {single !== undefined && view !== "sql" ? (
        <div className="py-6">
          <div className="text-4xl font-semibold tabular-nums">{formatCell(single)}</div>
          <div className="mt-1 text-sm text-muted">{result.columns[0]}</div>
        </div>
      ) : view === "chart" ? (
        <ResultChart spec={result.chart} rows={result.rows} />
      ) : view === "table" ? (
        result.rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">The query returned no rows.</p>
        ) : (
          <div className="max-h-96 overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-code">
                <tr>
                  {result.columns.map((c) => (
                    <th key={c} className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    {result.columns.map((c) => (
                      <td key={c} className={`whitespace-nowrap px-3 py-1.5 ${typeof r[c] === "number" ? "text-right tabular-nums" : ""}`}>
                        {formatCell(r[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <pre className="overflow-x-auto rounded-lg bg-code p-4 font-mono text-sm leading-relaxed">{result.sql}</pre>
      )}

      <footer className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <span>
          {result.rows.length} row{result.rows.length === 1 ? "" : "s"}
          {result.truncated && " (truncated)"}
        </span>
        {result.attempts > 1 && (
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-accent">
            self-corrected after {result.attempts - 1} failed {result.attempts === 2 ? "try" : "tries"}
          </span>
        )}
        <span className="flex-1" />
        <button onClick={copySql} className="hover:text-foreground">{copied ? "Copied!" : "Copy SQL"}</button>
        {result.rows.length > 0 && (
          <button onClick={downloadCsv} className="hover:text-foreground">Download CSV</button>
        )}
      </footer>
    </article>
  );
}
