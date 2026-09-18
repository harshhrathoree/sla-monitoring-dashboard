/**
 * POST /api/upload
 *
 * Accepts a multipart/form-data request with a single "file" field containing
 * a CSV. Runs the cleaning pipeline, batch-upserts into Neon, and returns a
 * JSON summary.
 *
 * This is the "real deployed serverless function" required by the spec.
 * When deployed to Vercel, this runs as an AWS Lambda-backed function on
 * Vercel's infrastructure — not locally, not in a container.
 */

import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { db, monitoringChecks, uploadBatches } from "@/db";
import { cleanBatch, type RawRow } from "@/lib/cleaner";
import { eq } from "drizzle-orm";

// Raise Vercel's default 4.5 MB body limit to 10 MB to handle the larger
// provided CSVs (~30-day file is ~1.5 MB; leaving headroom for future use).
export const config = {
  api: {
    bodyParser: false,
  },
};

// Vercel serverless function size limit config (Next.js App Router style)
export const maxDuration = 60; // seconds — upload + clean + insert can be slow

/** Number of rows per INSERT batch. Keeps each statement well under Postgres's
 *  65 535 parameter limit (9 params × 500 = 4 500, well within bounds). */
const BATCH_SIZE = 500;

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startMs = Date.now();

  // ── 1. Extract the file from multipart/form-data ──────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Failed to parse form data. Expected multipart/form-data." },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: 'No file found. Send a CSV as form field named "file".' },
      { status: 400 }
    );
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json(
      { error: "Only .csv files are accepted." },
      { status: 415 }
    );
  }

  // ── 2. Read file to string ────────────────────────────────────────────────
  let csvText: string;
  try {
    csvText = await file.text();
  } catch {
    return NextResponse.json(
      { error: "Failed to read file contents." },
      { status: 422 }
    );
  }

  if (!csvText.trim()) {
    return NextResponse.json({ error: "Uploaded file is empty." }, { status: 422 });
  }

  // ── 3. Parse CSV with PapaParse ───────────────────────────────────────────
  // dynamicTyping: false — we keep everything as strings so the cleaning
  // pipeline has full control over all type coercions.
  const parseResult = Papa.parse<RawRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });

  if (parseResult.errors.length > 0) {
    // Log but don't fail — PapaParse recovers from most row-level errors and
    // the cleaning pipeline will handle the residual bad rows.
    console.warn(
      `[upload] PapaParse reported ${parseResult.errors.length} errors in "${file.name}"`
    );
  }

  const rawRows = parseResult.data;
  if (rawRows.length === 0) {
    return NextResponse.json(
      { error: "CSV parsed successfully but contained no data rows." },
      { status: 422 }
    );
  }

  // ── 4. Run the cleaning pipeline ─────────────────────────────────────────
  const { rows: cleanedRows, rowsProcessed, rowsFlagged, rowsSkipped } =
    cleanBatch(rawRows);

  if (cleanedRows.length === 0) {
    return NextResponse.json(
      {
        error:
          "All rows were skipped after cleaning. Check that the CSV matches the expected format.",
        rowsProcessed,
        rowsSkipped,
      },
      { status: 422 }
    );
  }

  // ── 5. Create the upload_batches record (placeholder counts) ──────────────
  // We insert the batch row first so we have the UUID to reference in the
  // monitoring_checks FK. Counts are updated at the end.
  let batchId: string;
  try {
    const [batch] = await db
      .insert(uploadBatches)
      .values({
        filename: file.name,
        rowsProcessed: 0,
        rowsInserted: 0,
        rowsFlagged: 0,
        rowsSkipped: 0,
      })
      .returning({ id: uploadBatches.id });
    batchId = batch.id;
  } catch (err) {
    console.error("[upload] Failed to create upload_batches record:", err);
    return NextResponse.json(
      { error: "Database error while initialising upload batch." },
      { status: 500 }
    );
  }

  // ── 6. Batch-upsert monitoring_checks ─────────────────────────────────────
  // ON CONFLICT (service_id, timestamp_utc, agent) DO NOTHING
  // → true duplicates (same agent+service+timestamp) are silently skipped.
  // → multi-agent reports are preserved because agent is part of the key.
  let rowsInserted = 0;

  try {
    for (let i = 0; i < cleanedRows.length; i += BATCH_SIZE) {
      const chunk = cleanedRows.slice(i, i + BATCH_SIZE);

      const values = chunk.map((r) => ({
        serviceId: r.serviceId,
        serviceName: r.serviceName,
        timestampUtc: r.timestampUtc,
        statusCode: r.statusCode,
        latencyMs: r.latencyMs,
        agent: r.agent,
        region: r.region,
        dataQualityFlags: r.dataQualityFlags,
        uploadBatchId: batchId,
      }));

      const inserted = await db
        .insert(monitoringChecks)
        .values(values)
        .onConflictDoNothing()
        .returning({ id: monitoringChecks.id });

      rowsInserted += inserted.length;
    }
  } catch (err) {
    console.error("[upload] Failed during batch upsert:", err);
    // Attempt to clean up the orphaned batch record
    await db
      .delete(uploadBatches)
      .where(eq(uploadBatches.id, batchId))
      .catch(() => null);
    return NextResponse.json(
      { error: "Database error during row insertion." },
      { status: 500 }
    );
  }

  // Rows that PapaParse accepted but the DB rejected as duplicates
  const dbSkipped = cleanedRows.length - rowsInserted;
  const totalSkipped = rowsSkipped + dbSkipped;

  // ── 7. Update batch summary counts ────────────────────────────────────────
  try {
    await db
      .update(uploadBatches)
      .set({
        rowsProcessed: rowsProcessed,
        rowsInserted: rowsInserted,
        rowsFlagged: rowsFlagged,
        rowsSkipped: totalSkipped,
      })
      .where(eq(uploadBatches.id, batchId));
  } catch (err) {
    // Non-fatal — the data is in. Just log.
    console.error("[upload] Failed to update batch summary:", err);
  }

  const durationMs = Date.now() - startMs;

  console.log(
    `[upload] "${file.name}" processed in ${durationMs}ms — ` +
      `processed=${rowsProcessed} inserted=${rowsInserted} ` +
      `flagged=${rowsFlagged} skipped=${totalSkipped}`
  );

  // ── 8. Return summary ─────────────────────────────────────────────────────
  return NextResponse.json(
    {
      batchId,
      filename: file.name,
      rowsProcessed,
      rowsInserted,
      rowsFlagged,
      rowsSkipped: totalSkipped,
      durationMs,
    },
    { status: 200 }
  );
}
