import { parseCsv, toIdentifier, type ParsedTable } from "@/lib/csv";
import { createDataset, getTables } from "@/lib/db";

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

// Accepts one or more CSV files (form field "files"); each becomes a table in a new in-memory dataset.
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected a multipart form upload." }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return Response.json({ error: "Choose a CSV file to upload." }, { status: 400 });
  if (files.length > MAX_FILES) return Response.json({ error: `Upload at most ${MAX_FILES} files at once.` }, { status: 400 });
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_BYTES) return Response.json({ error: "Files are too large (10 MB total max)." }, { status: 413 });

  const tables: ParsedTable[] = [];
  const used = new Set<string>();
  for (const file of files) {
    const base = toIdentifier(file.name.replace(/\.[^.]*$/, ""), "data");
    let name = base;
    for (let n = 2; used.has(name); n++) name = `${base}_${n}`;
    used.add(name);
    try {
      tables.push(parseCsv(await file.text(), name));
    } catch (e) {
      return Response.json({ error: `${file.name}: ${e instanceof Error ? e.message : "couldn't read the file."}` }, { status: 422 });
    }
  }

  const datasetId = createDataset(tables);
  return Response.json({
    datasetId,
    name: files.map((f) => f.name).join(", "),
    rowCount: tables.reduce((n, t) => n + t.rows.length, 0),
    tables: getTables(datasetId),
  });
}
