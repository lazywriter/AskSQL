import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { getSampleRows, getSchemaDDL, runQuery } from "./db";
import { guardSql } from "./sqlGuard";
import type { HistoryTurn, QueryResult } from "./types";

export type { HistoryTurn };

// "gemini-flash-latest" always points at Google's current Flash model (available on the free tier).
const MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
const MAX_ATTEMPTS = 3;

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new MissingKeyError();
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

const ChartSpec = z.object({
  type: z.enum(["bar", "line", "pie", "table"]),
  x: z.string().describe("Result column for the x-axis / pie labels. Empty string for table."),
  y: z.array(z.string()).describe("Numeric result columns to plot. Empty for table."),
  title: z.string(),
});

const Answer = z.object({
  answerable: z.boolean().describe("False if the question cannot be answered from this schema."),
  sql: z.string().describe("A single read-only SQLite SELECT statement. Empty if not answerable."),
  explanation: z.string().describe("One or two sentences, plain English, on what the query computes."),
  chart: ChartSpec,
});

export class NL2SQLError extends Error {
  constructor(message: string, public sql?: string) {
    super(message);
  }
}

export class MissingKeyError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not set.");
  }
}

// Drop the "$schema" meta key; Gemini only needs the schema body.
const ANSWER_JSON_SCHEMA: Record<string, unknown> = z.toJSONSchema(Answer);
delete ANSWER_JSON_SCHEMA.$schema;

function systemPrompt(datasetId?: string): string {
  const today = new Date().toISOString().slice(0, 10);
  // The sample database has known conventions; uploaded CSVs don't, so show the model real rows instead.
  const dataRules = datasetId
    ? `Sample rows (JSON):
${getSampleRows(datasetId)}

Data notes:
- These tables were imported from user-uploaded CSV files. Dates are TEXT exactly as they appeared in the file; check the sample rows for their format, and convert with substr()/date() if they aren't YYYY-MM-DD. "Today" is ${today}.
- Text values keep the file's original casing; compare case-insensitively (LOWER() or LIKE) when matching user-typed values.`
    : `Rules for this database:
- Dates are TEXT in YYYY-MM-DD form; use strftime/date() for grouping and ranges. "Today" is ${today}.
- Revenue = SUM(order_items.quantity * order_items.unit_price), counting only orders whose status is 'delivered' or 'shipped' unless the user says otherwise.`;

  return `You translate business questions into SQLite queries for an analytics dashboard.

Database schema:
${getSchemaDDL(datasetId)}

${dataRules}

Rules:
- Write exactly one SQLite SELECT (CTEs with WITH are fine). Never modify data.
- Give result columns short snake_case aliases and ROUND money to 2 decimals.
- Order results meaningfully and add a LIMIT when the user asks for "top N".
- Pick the chart that fits: line for time series (x = the time column, sorted ascending), bar for comparing categories, pie only for share-of-total with 8 or fewer slices, table for lists of records or a single value.
- chart.x and chart.y must be exact column names from your SELECT.
- If the question can't be answered from this schema, set answerable to false and explain why.`;
}

function userPrompt(question: string, history: HistoryTurn[]): string {
  if (history.length === 0) return question;
  const prior = history
    .slice(-5)
    .map((h, i) => `${i + 1}. Q: ${h.question}\n   SQL: ${h.sql}`)
    .join("\n");
  return `Earlier questions in this session (for follow-ups like "now by country"):\n${prior}\n\nNew question: ${question}`;
}

export async function answerQuestion(question: string, history: HistoryTurn[] = [], datasetId?: string): Promise<QueryResult> {
  let feedback = "";
  let lastSql = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await getClient().models.generateContent({
      model: MODEL,
      contents: userPrompt(question, history) + feedback,
      config: {
        systemInstruction: systemPrompt(datasetId),
        responseMimeType: "application/json",
        responseJsonSchema: ANSWER_JSON_SCHEMA,
        temperature: 0,
      },
    });

    if (response.promptFeedback?.blockReason) throw new NL2SQLError("Gemini blocked this question.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.text ?? "");
    } catch {
      throw new NL2SQLError("The model returned an unreadable response.");
    }
    const result = Answer.safeParse(parsed);
    if (!result.success) throw new NL2SQLError("The model's response didn't match the expected format.");
    const out = result.data;
    if (!out.answerable) throw new NL2SQLError(out.explanation);

    lastSql = out.sql;
    const guarded = guardSql(out.sql);
    let error: string;
    if (guarded.ok) {
      try {
        const { columns, rows, truncated } = runQuery(guarded.sql, datasetId);
        return { question, sql: guarded.sql, explanation: out.explanation, chart: out.chart, columns, rows, truncated, attempts: attempt };
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    } else {
      error = guarded.reason;
    }

    // Self-correction: show the model its query and the error, then try again.
    feedback = `\n\nYour previous attempt failed.\nSQL:\n${out.sql}\nError: ${error}\nFix the query.`;
  }

  throw new NL2SQLError(`Couldn't produce a working query after ${MAX_ATTEMPTS} attempts.`, lastSql);
}
