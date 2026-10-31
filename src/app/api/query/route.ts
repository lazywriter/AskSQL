import { ApiError } from "@google/genai";
import { DatasetNotFoundError } from "@/lib/db";
import { answerQuestion, MissingKeyError, NL2SQLError, type HistoryTurn } from "@/lib/nl2sql";

export async function POST(req: Request) {
  let body: { question?: unknown; history?: unknown; datasetId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return Response.json({ error: "Ask a question first." }, { status: 400 });
  if (question.length > 1000) return Response.json({ error: "Question is too long." }, { status: 400 });

  const history: HistoryTurn[] = Array.isArray(body.history)
    ? body.history
        .filter((h): h is HistoryTurn => typeof h?.question === "string" && typeof h?.sql === "string")
        .map(({ question, sql }) => ({ question, sql }))
    : [];
  const datasetId = typeof body.datasetId === "string" && body.datasetId ? body.datasetId : undefined;

  try {
    return Response.json(await answerQuestion(question, history, datasetId));
  } catch (e) {
    if (e instanceof DatasetNotFoundError) return Response.json({ error: e.message }, { status: 404 });
    if (e instanceof NL2SQLError) return Response.json({ error: e.message, sql: e.sql }, { status: 422 });
    if (e instanceof MissingKeyError)
      return Response.json({ error: "Gemini API key is missing. Set GEMINI_API_KEY in .env.local and restart the dev server." }, { status: 500 });
    if (e instanceof ApiError) {
      if (e.status === 400 && /api key/i.test(e.message))
        return Response.json({ error: "Gemini API key is invalid. Check GEMINI_API_KEY in .env.local." }, { status: 500 });
      if (e.status === 429)
        return Response.json({ error: "Gemini free-tier rate limit reached. Wait a minute and try again." }, { status: 429 });
      if (e.status === 404)
        return Response.json({ error: "Gemini model not found. Set GEMINI_MODEL in .env.local to a model your key can use." }, { status: 500 });
      return Response.json({ error: `Gemini API error: ${e.message}` }, { status: 502 });
    }
    console.error(e);
    return Response.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
