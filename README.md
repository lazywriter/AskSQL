# AskSQL — Natural Language → SQL Dashboard

Ask questions about a database in plain English. Google Gemini writes the SQL, the server runs it safely, and the app draws the right chart.

**Features**
- Upload your own CSV files (several at once become joinable tables) and query them instead of the sample data
- Plain-English questions → SQLite queries via Gemini (JSON-schema output: SQL + explanation + chart spec)
- Auto-picked visualizations: line, bar, pie, big-number, or table (Recharts)
- Follow-up questions use session context ("now split that by country")
- Self-correction: if the SQL fails, the error is fed back to Gemini (up to 3 attempts)
- Two-layer safety: an SQL guard (single SELECT only, no write/DDL keywords) **and** a read-only DB connection; results capped at 500 rows
- Schema explorer, SQL view, copy SQL, CSV export, light/dark mode, mobile layout

## Quick start

```bash
npm install
npm run seed            # creates data/shop.db (customers, products, orders, order_items)
echo "GEMINI_API_KEY=your_key" > .env.local   # free key at aistudio.google.com
npm run dev
```

Open http://localhost:3000.

## How it works

```
question ──► /api/query ──► Gemini (schema in system prompt, JSON-schema output)
                               │  { answerable, sql, explanation, chart }
                               ▼
                         sqlGuard (SELECT only) ──► read-only SQLite ──► rows
                               ▲                         │
                               └──── error fed back ◄────┘ (retry ≤ 3)
```

| File | Purpose |
|---|---|
| `src/lib/nl2sql.ts` | Prompt, Gemini call, retry loop |
| `src/lib/sqlGuard.ts` | Rejects anything that isn't one read-only SELECT |
| `src/lib/db.ts` | Read-only SQLite (Node's built-in `node:sqlite`), uploaded datasets, schema introspection, row cap |
| `src/lib/csv.ts` / `src/app/api/upload/route.ts` | CSV parsing, column naming and type inference; upload endpoint |
| `src/components/ResultCard.tsx` / `ResultChart.tsx` | Result views and charts |
| `scripts/seed.mjs` | Deterministic sample dataset (~4k orders, Jan 2025 – Oct 2026) |

## Using your own data

**Upload CSVs:** click **Upload CSV** in the sidebar. Each file becomes a table (named after the file, with snake_case columns, and INTEGER/REAL/TEXT types inferred from the values). Comma, semicolon, tab and pipe delimiters are detected automatically. Limits: 5 files and 10 MB per upload.
Uploads live in memory on the server, are locked read-only after import, and are lost on restart; the 20 most recent are kept. **Use sample data** switches back.

**Point at a SQLite file:**

Point `DATABASE_PATH` at any SQLite file. The schema is read automatically. Update the business rules in the system prompt in `src/lib/nl2sql.ts` (e.g. how "revenue" is defined).

Requires Node 22.5+ (for `node:sqlite`).
