/**
 * GET /api/stats
 *
 * Thin wrapper around getStats() — the actual query logic lives in
 * src/lib/getStats.ts so it can be called directly by Server Components
 * without an HTTP round-trip.
 */

import { NextResponse } from "next/server";
import { getStats } from "@/lib/getStats";

export async function GET() {
  try {
    const data = await getStats();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/stats] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch stats", detail: message },
      { status: 500 }
    );
  }
}
