/**
 * lib/getStats.ts
 *
 * Shared stats query logic extracted so it can be called directly from
 * Server Components without an HTTP round-trip to /api/stats.
 *
 * The /api/stats route also imports and calls this same function, keeping
 * both code paths in sync.
 */

import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  type ServiceStats,
  type StatsResponse,
  type Incident,
  type DailyUptime,
  SLA_TARGET,
  INCIDENT_GAP_MINUTES,
} from "@/types/api";

interface ServiceAggRow {
  service_id: string;
  service_name: string;
  total_checks: string;
  successful_checks: string;
  error_count: string;
  avg_latency_ms: string | null;
  p99_latency_ms: string | null;
  first_check: string;
  last_check: string;
}

interface DailyRow {
  service_id: string;
  day: string;
  total: string;
  successful: string;
}

interface IncidentRow {
  service_id: string;
  timestamp_utc: string;
}

interface UploadRow {
  uploaded_at: string;
}

interface TotalRow {
  total: string;
}

function buildIncidents(errorTimestamps: Date[]): Incident[] {
  if (errorTimestamps.length === 0) return [];

  const incidents: Incident[] = [];
  let windowStart = errorTimestamps[0];
  let windowEnd = errorTimestamps[0];
  let errorCount = 1;

  for (let i = 1; i < errorTimestamps.length; i++) {
    const prev = errorTimestamps[i - 1];
    const curr = errorTimestamps[i];
    const gapMinutes = (curr.getTime() - prev.getTime()) / 60_000;

    if (gapMinutes <= INCIDENT_GAP_MINUTES) {
      windowEnd = curr;
      errorCount++;
    } else {
      incidents.push({
        startTime: windowStart.toISOString(),
        endTime: windowEnd.toISOString(),
        durationMinutes: Math.round(
          (windowEnd.getTime() - windowStart.getTime()) / 60_000
        ),
        errorCount,
      });
      windowStart = curr;
      windowEnd = curr;
      errorCount = 1;
    }
  }

  incidents.push({
    startTime: windowStart.toISOString(),
    endTime: windowEnd.toISOString(),
    durationMinutes: Math.round(
      (windowEnd.getTime() - windowStart.getTime()) / 60_000
    ),
    errorCount,
  });

  return incidents;
}

export async function getStats(): Promise<StatsResponse> {
  const db = getDb();

  const serviceResult = await db.execute(sql`
    SELECT
      service_id,
      service_name,
      COUNT(*)::text                                                  AS total_checks,
      COUNT(*) FILTER (WHERE status_code BETWEEN 200 AND 299)::text  AS successful_checks,
      COUNT(*) FILTER (WHERE status_code < 200 OR status_code > 299)::text AS error_count,
      AVG(latency_ms) FILTER (WHERE latency_ms IS NOT NULL)::text    AS avg_latency_ms,
      PERCENTILE_CONT(0.99) WITHIN GROUP (
        ORDER BY latency_ms
      ) FILTER (WHERE latency_ms IS NOT NULL)::text                  AS p99_latency_ms,
      MIN(timestamp_utc)::text                                       AS first_check,
      MAX(timestamp_utc)::text                                       AS last_check
    FROM monitoring_checks
    GROUP BY service_id, service_name
    ORDER BY service_id
  `);
  const serviceRows = serviceResult.rows as unknown as ServiceAggRow[];

  const dailyResult = await db.execute(sql`
    SELECT
      service_id,
      DATE_TRUNC('day', timestamp_utc)::date::text  AS day,
      COUNT(*)::text                                 AS total,
      COUNT(*) FILTER (WHERE status_code BETWEEN 200 AND 299)::text AS successful
    FROM monitoring_checks
    GROUP BY service_id, DATE_TRUNC('day', timestamp_utc)
    ORDER BY service_id, day
  `);
  const dailyRows = dailyResult.rows as unknown as DailyRow[];

  const incidentResult = await db.execute(sql`
    SELECT
      service_id,
      timestamp_utc::text AS timestamp_utc
    FROM monitoring_checks
    WHERE status_code < 200 OR status_code > 299
    ORDER BY service_id, timestamp_utc
  `);
  const incidentRows = incidentResult.rows as unknown as IncidentRow[];

  const uploadResult = await db.execute(sql`
    SELECT uploaded_at::text AS uploaded_at
    FROM upload_batches
    ORDER BY uploaded_at DESC
    LIMIT 1
  `);
  const uploadRows = uploadResult.rows as unknown as UploadRow[];

  const totalResult = await db.execute(sql`
    SELECT COUNT(*)::text AS total FROM monitoring_checks
  `);
  const totalRows = totalResult.rows as unknown as TotalRow[];

  // Index daily rows by service_id
  const dailyByService = new Map<string, DailyRow[]>();
  for (const row of dailyRows) {
    const list = dailyByService.get(row.service_id) ?? [];
    list.push(row);
    dailyByService.set(row.service_id, list);
  }

  // Index error timestamps by service_id
  const errorsByService = new Map<string, Date[]>();
  for (const row of incidentRows) {
    const list = errorsByService.get(row.service_id) ?? [];
    list.push(new Date(row.timestamp_utc));
    errorsByService.set(row.service_id, list);
  }

  const services: ServiceStats[] = serviceRows.map((row) => {
    const totalChecks = parseInt(row.total_checks, 10);
    const successfulChecks = parseInt(row.successful_checks, 10);
    const uptimePct =
      totalChecks > 0
        ? parseFloat(((successfulChecks / totalChecks) * 100).toFixed(4))
        : 100;

    const firstCheck = new Date(row.first_check);
    const lastCheck = new Date(row.last_check);
    const daysCovered =
      Math.ceil(
        (lastCheck.getTime() - firstCheck.getTime()) / (1000 * 60 * 60 * 24)
      ) + 1;

    const dailyUptime: DailyUptime[] = (
      dailyByService.get(row.service_id) ?? []
    ).map((d) => {
      const total = parseInt(d.total, 10);
      const succ = parseInt(d.successful, 10);
      return {
        date: d.day,
        uptimePct:
          total > 0 ? parseFloat(((succ / total) * 100).toFixed(2)) : 100,
        totalChecks: total,
        successfulChecks: succ,
      };
    });

    const errorTimestamps = errorsByService.get(row.service_id) ?? [];
    const incidents: Incident[] = buildIncidents(errorTimestamps);

    return {
      serviceId: row.service_id,
      serviceName: row.service_name,
      totalChecks,
      successfulChecks,
      uptimePct,
      slaBreached: uptimePct < SLA_TARGET,
      errorCount: parseInt(row.error_count, 10),
      avgLatencyMs:
        row.avg_latency_ms != null
          ? parseFloat(parseFloat(row.avg_latency_ms).toFixed(2))
          : null,
      p99LatencyMs:
        row.p99_latency_ms != null
          ? parseFloat(parseFloat(row.p99_latency_ms).toFixed(2))
          : null,
      firstCheck: firstCheck.toISOString(),
      lastCheck: lastCheck.toISOString(),
      daysCovered,
      incidents,
      dailyUptime,
    };
  });

  const grandTotal = services.reduce((sum, s) => sum + s.totalChecks, 0);
  const grandSuccess = services.reduce((sum, s) => sum + s.successfulChecks, 0);
  const overallUptimePct =
    grandTotal > 0
      ? parseFloat(((grandSuccess / grandTotal) * 100).toFixed(4))
      : 100;

  return {
    services,
    overallUptimePct,
    lastUploadAt:
      uploadRows.length > 0
        ? new Date(uploadRows[0].uploaded_at).toISOString()
        : null,
    totalRows: parseInt(totalRows[0]?.total ?? "0", 10),
  };
}
