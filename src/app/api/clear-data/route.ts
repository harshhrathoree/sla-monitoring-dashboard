/**
 * DELETE /api/clear-data
 *
 * Truncates all monitoring_checks and upload_batches rows.
 * This is a destructive operation — the UI requires a confirmation step
 * before calling this endpoint.
 *
 * Cascade delete on monitoring_checks (FK to upload_batches) means
 * truncating upload_batches is sufficient, but we truncate both explicitly
 * for clarity and to reset sequences.
 */

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export async function DELETE() {
  try {
    const db = getDb();

    // TRUNCATE ... CASCADE handles the FK from monitoring_checks → upload_batches.
    // RESTART IDENTITY resets the serial PK counter on monitoring_checks.
    await db.execute(sql`
      TRUNCATE TABLE upload_batches, monitoring_checks RESTART IDENTITY CASCADE
    `);

    return NextResponse.json({ ok: true, message: "All data cleared." });
  } catch (err) {
    console.error("[api/clear-data] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to clear data", detail: message },
      { status: 500 }
    );
  }
}
