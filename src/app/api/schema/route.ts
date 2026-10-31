import { DatasetNotFoundError, getTables } from "@/lib/db";

export async function GET(req: Request) {
  const datasetId = new URL(req.url).searchParams.get("dataset") ?? undefined;
  try {
    return Response.json({ tables: getTables(datasetId) });
  } catch (e) {
    if (e instanceof DatasetNotFoundError) return Response.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
