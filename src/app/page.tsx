"use client";

import { useEffect, useRef, useState } from "react";
import ResultCard from "@/components/ResultCard";
import type { QueryResult, TableInfo } from "@/lib/types";

const EXAMPLES = [
  "Monthly revenue over the last 12 months",
  "Top 5 products by revenue",
  "Revenue share by category",
  "Which countries have the most customers?",
  "Cancellation rate by month in 2026",
  "Who are our 10 biggest spenders?",
];

const UPLOAD_EXAMPLES = ["Show 10 sample rows", "How many rows are there?", "Summarize the main numeric columns"];

type Source = { datasetId: string; name: string; rowCount: number } | null;

type Entry = { id: number; result: QueryResult } | { id: number; error: string; question: string; sql?: string };

export default function Home() {
  const [question, setQuestion] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [showSchema, setShowSchema] = useState(false);
  // null = the server's built-in database; otherwise an uploaded CSV dataset.
  const [source, setSource] = useState<Source>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    fetch("/api/schema")
      .then((r) => r.json())
      .then((d) => setTables(d.tables ?? []))
      .catch(() => {});
  }, []);

  async function upload(files: FileList | null) {
    if (!files?.length || uploading) return;
    setUploading(true);
    setUploadError(null);
    const form = new FormData();
    for (const f of Array.from(files)) form.append("files", f);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error ?? "Upload failed.");
        return;
      }
      setSource({ datasetId: data.datasetId, name: data.name, rowCount: data.rowCount });
      setTables(data.tables);
      setEntries([]);
    } catch {
      setUploadError("Network error — is the server running?");
    } finally {
      setUploading(false);
      inputRef.current?.focus();
    }
  }

  async function switchToSample() {
    setSource(null);
    setUploadError(null);
    setEntries([]);
    try {
      const d = await (await fetch("/api/schema")).json();
      setTables(d.tables ?? []);
    } catch {
      setTables([]);
    }
  }

  async function ask(q: string) {
    q = q.trim();
    if (!q || loading) return;
    setLoading(q);
    setQuestion("");
    // Successful turns, oldest first, give the model context for follow-ups.
    const history = entries
      .filter((e): e is Extract<Entry, { result: QueryResult }> => "result" in e)
      .map((e) => ({ question: e.result.question, sql: e.result.sql }))
      .reverse();
    const id = nextId.current++;
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history, datasetId: source?.datasetId }),
      });
      const data = await res.json();
      const entry: Entry = res.ok ? { id, result: data } : { id, error: data.error ?? "Request failed.", question: q, sql: data.sql };
      setEntries((prev) => [entry, ...prev]);
    } catch {
      setEntries((prev) => [{ id, error: "Network error — is the server running?", question: q }, ...prev]);
    } finally {
      setLoading(null);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 lg:flex-row lg:px-8">
      <aside className="lg:w-64 lg:shrink-0">
        <div className="flex items-center justify-between lg:block">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Ask<span className="text-accent">SQL</span>
            </h1>
            <p className="mt-0.5 text-xs text-muted">Plain English → SQL → chart</p>
          </div>
          <button onClick={() => setShowSchema((s) => !s)} className="text-sm text-accent lg:hidden">
            {showSchema ? "Hide schema" : "Show schema"}
          </button>
        </div>
        <div className={`${showSchema ? "block" : "hidden"} mt-4 space-y-3 lg:block`}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Data source</p>
          <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <p className="truncate font-medium" title={source?.name}>
              {source ? source.name : "Sample shop database"}
            </p>
            {source && <p className="text-xs text-muted">{source.rowCount.toLocaleString()} rows imported</p>}
            <div className="mt-2 flex items-center gap-3">
              <label
                className={`cursor-pointer text-accent hover:underline ${uploading || loading ? "pointer-events-none opacity-40" : ""}`}
              >
                {uploading ? "Uploading…" : "Upload CSV"}
                <input
                  type="file"
                  accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    upload(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              {source && (
                <button onClick={switchToSample} disabled={uploading || !!loading} className="text-muted hover:text-foreground">
                  Use sample data
                </button>
              )}
            </div>
            {uploadError && <p className="mt-1.5 text-xs text-danger">{uploadError}</p>}
          </div>
          <p className="pt-1 text-xs font-medium uppercase tracking-wide text-muted">Schema</p>
          {tables.map((t) => (
            <details key={t.name} className="rounded-lg border border-border bg-card px-3 py-2 text-sm" open>
              <summary className="cursor-pointer font-medium">{t.name}</summary>
              <ul className="mt-1.5 space-y-0.5">
                {t.columns.map((c) => (
                  <li key={c.name} className="flex justify-between gap-2 font-mono text-xs">
                    <span>{c.name}</span>
                    <span className="text-muted">{c.type.toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
          className="sticky top-4 z-10 rounded-xl border border-border bg-card p-2 shadow-sm"
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(question);
                }
              }}
              rows={1}
              autoFocus
              placeholder={entries.length ? "Ask a follow-up…" : "Ask about your data…"}
              className="field-sizing-content max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-3 py-2 outline-none placeholder:text-muted"
            />
            <button
              type="submit"
              disabled={!question.trim() || !!loading}
              className="h-10 rounded-lg bg-accent px-4 text-sm font-medium text-white transition disabled:opacity-40"
            >
              {loading ? "Thinking…" : "Ask"}
            </button>
          </div>
        </form>

        {entries.length === 0 && !loading && (
          <div className="mt-8">
            <p className="mb-3 text-sm text-muted">Try one of these:</p>
            <div className="flex flex-wrap gap-2">
              {(source ? UPLOAD_EXAMPLES : EXAMPLES).map((ex) => (
                <button
                  key={ex}
                  onClick={() => ask(ex)}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-sm transition hover:border-accent hover:text-accent"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {entries.length > 0 && (
          <div className="mt-4 flex justify-end">
            <button onClick={() => setEntries([])} disabled={!!loading} className="text-xs text-muted hover:text-foreground">
              New session
            </button>
          </div>
        )}

        <div className="mt-2 space-y-4">
          {loading && (
            <div className="animate-pulse rounded-xl border border-border bg-card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{loading}</p>
              <div className="mt-3 h-4 w-1/3 rounded bg-code" />
              <div className="mt-2 h-3 w-2/3 rounded bg-code" />
              <div className="mt-4 h-56 rounded-lg bg-code" />
            </div>
          )}
          {entries.map((e) =>
            "result" in e ? (
              <ResultCard key={e.id} result={e.result} />
            ) : (
              <div key={e.id} className="rounded-xl border border-danger/40 bg-card p-4 sm:p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">{e.question}</p>
                <p className="mt-1 text-sm text-danger">{e.error}</p>
                {e.sql && <pre className="mt-3 overflow-x-auto rounded-lg bg-code p-3 font-mono text-xs">{e.sql}</pre>}
              </div>
            ),
          )}
        </div>
      </main>
    </div>
  );
}
