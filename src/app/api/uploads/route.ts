/**
 * GET /api/uploads
 *
 * Returns the most recent upload batches (default: last 20), newest first.
 * Used by the upload page to show upload history.
 */

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

interface UploadBatchRow {
  id: string;
  filename: string;
  uploaded_at: string;
  rows_processed: number;
  rows_inserted: number;
  rows_flagged: number;
  rows_skipped: number;
}

export interface UploadHistoryItem {
  id: string;
  filename: string;
  uploadedAt: string;
  rowsProcessed: number;
  rowsInserted: number;
  rowsFlagged: number;
  rowsSkipped: number;
}

export async function GET() {
  try {
    const db = getDb();

    const result = await db.execute(sql`
      SELECT
        id,
        filename,
        uploaded_at::text AS uploaded_at,
        rows_processed,
        rows_inserted,
        rows_flagged,
        rows_skipped
      FROM upload_batches
      ORDER BY uploaded_at DESC
      LIMIT 20
    `);

    const rows = result.rows as unknown as UploadBatchRow[];

    const items: UploadHistoryItem[] = rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      uploadedAt: new Date(r.uploaded_at).toISOString(),
      rowsProcessed: r.rows_processed,
      rowsInserted: r.rows_inserted,
      rowsFlagged: r.rows_flagged,
      rowsSkipped: r.rows_skipped,
    }));

    return NextResponse.json(items);
  } catch (err) {
    console.error("[api/uploads] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch upload history" },
      { status: 500 }
    );
  }
}
