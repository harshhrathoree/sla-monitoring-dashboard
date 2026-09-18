/**
 * GET /api/logs
 *
 * Returns paginated, filtered monitoring_checks rows.
 *
 * Query parameters:
 *   service  string           filter by service_id (optional)
 *   from     ISO date string  start of timestamp range, inclusive (optional)
 *   to       ISO date string  end of timestamp range, inclusive (optional)
 *   status   "ok"|"error"|"flagged"  filter by row classification (optional)
 *   page     integer ≥ 1     page number (default: 1)
 *   limit    integer 1–200   rows per page (default: 50)
 *
 * Response shape: LogsResponse (see src/types/api.ts)
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { type LogRow, type LogsResponse } from "@/types/api";

// ─── Raw Postgres row shapes ──────────────────────────────────────────────────

interface RawLogRow {
  id: number;
  service_id: string;
  service_name: string;
  timestamp_utc: string;
  status_code: number;
  latency_ms: number | null;
  agent: string;
  region: string;
  data_quality_flags: string | null;
}

interface CountRow {
  total: string;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  // ── Parse + validate query params ─────────────────────────────────────────
  const serviceParam = searchParams.get("service")?.trim() || null;
  const fromParam = searchParams.get("from")?.trim() || null;
  const toParam = searchParams.get("to")?.trim() || null;
  const statusParam = searchParams.get("status")?.trim() || null;

  const pageRaw = parseInt(searchParams.get("page") ?? "1", 10);
  const limitRaw = parseInt(searchParams.get("limit") ?? "50", 10);

  const page = isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
  const limit = isNaN(limitRaw) || limitRaw < 1 ? 50 : Math.min(limitRaw, 200);
  const offset = (page - 1) * limit;

  if (fromParam && isNaN(Date.parse(fromParam))) {
    return NextResponse.json(
      { error: `Invalid "from" date: "${fromParam}"` },
      { status: 400 }
    );
  }
  if (toParam && isNaN(Date.parse(toParam))) {
    return NextResponse.json(
      { error: `Invalid "to" date: "${toParam}"` },
      { status: 400 }
    );
  }
  if (statusParam && !["ok", "error", "flagged"].includes(statusParam)) {
    return NextResponse.json(
      { error: `Invalid "status" value. Must be one of: ok, error, flagged` },
      { status: 400 }
    );
  }

  try {
    const db = getDb();

    // ── Build dynamic WHERE fragments ─────────────────────────────────────
    // We compose sql fragments and reduce them to a single clause.
    // Using raw sql`` keeps dynamic multi-condition queries straightforward.
    type SqlFrag = ReturnType<typeof sql>;
    const conditions: SqlFrag[] = [];

    if (serviceParam) {
      conditions.push(sql`service_id = ${serviceParam}`);
    }
    if (fromParam) {
      conditions.push(sql`timestamp_utc >= ${fromParam}::timestamptz`);
    }
    if (toParam) {
      // Include the full end day: add 1 day and use strict less-than
      const toDate = new Date(toParam);
      toDate.setUTCDate(toDate.getUTCDate() + 1);
      conditions.push(sql`timestamp_utc < ${toDate.toISOString()}::timestamptz`);
    }
    if (statusParam === "ok") {
      conditions.push(sql`status_code BETWEEN 200 AND 299`);
    } else if (statusParam === "error") {
      conditions.push(sql`(status_code < 200 OR status_code > 299)`);
    } else if (statusParam === "flagged") {
      conditions.push(
        sql`data_quality_flags IS NOT NULL AND data_quality_flags != ''`
      );
    }

    const whereClause: SqlFrag =
      conditions.length > 0
        ? sql`WHERE ${conditions.reduce((acc: SqlFrag, cond: SqlFrag, i: number) =>
            i === 0 ? cond : sql`${acc} AND ${cond}`
          )}`
        : sql``;

    // ── Count total matching rows (same WHERE, no LIMIT) ──────────────────
    const countResult = await db.execute(sql`
      SELECT COUNT(*)::text AS total
      FROM monitoring_checks
      ${whereClause}
    `);
    const totalCount = parseInt(
      ((countResult.rows as unknown as CountRow[])[0]?.total ?? "0"),
      10
    );

    // ── Fetch paginated rows ───────────────────────────────────────────────
    const dataResult = await db.execute(sql`
      SELECT
        id,
        service_id,
        service_name,
        timestamp_utc::text  AS timestamp_utc,
        status_code,
        latency_ms,
        agent,
        region,
        data_quality_flags
      FROM monitoring_checks
      ${whereClause}
      ORDER BY timestamp_utc DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);
    const rawRows = dataResult.rows as unknown as RawLogRow[];

    // ── Shape response ────────────────────────────────────────────────────
    const logRows: LogRow[] = rawRows.map((r) => ({
      id: r.id,
      serviceId: r.service_id,
      serviceName: r.service_name,
      timestampUtc: new Date(r.timestamp_utc).toISOString(),
      statusCode: r.status_code,
      latencyMs: r.latency_ms,
      agent: r.agent,
      region: r.region,
      dataQualityFlags: r.data_quality_flags ?? "",
    }));

    const response: LogsResponse = {
      rows: logRows,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[api/logs] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch logs", detail: message },
      { status: 500 }
    );
  }
}
