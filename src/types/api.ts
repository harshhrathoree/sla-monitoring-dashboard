/**
 * types/api.ts — Shared TypeScript types for all API route responses.
 *
 * Kept in one place so both the API routes (server) and the dashboard
 * UI components (client) import from the same source of truth.
 * No runtime code here — types only.
 */

// ─── /api/stats ───────────────────────────────────────────────────────────────

/** Per-service SLA statistics aggregated across all data in the database. */
export interface ServiceStats {
  serviceId: string;
  serviceName: string;
  totalChecks: number;
  successfulChecks: number;
  /** Percentage, e.g. 99.97 */
  uptimePct: number;
  /** true when uptimePct < SLA_TARGET (99.9) */
  slaBreached: boolean;
  errorCount: number;
  /** ms, null if no valid latency rows */
  avgLatencyMs: number | null;
  /** 99th percentile ms, null if no valid latency rows */
  p99LatencyMs: number | null;
  /** ISO string of the earliest check in the DB */
  firstCheck: string;
  /** ISO string of the latest check in the DB */
  lastCheck: string;
  /** Number of calendar days spanned by the data */
  daysCovered: number;
  /** Consecutive error runs (incidents) */
  incidents: Incident[];
  /** Uptime per calendar day — for sparkline chart */
  dailyUptime: DailyUptime[];
}

export interface Incident {
  /** ISO string */
  startTime: string;
  /** ISO string */
  endTime: string;
  /** Duration in minutes */
  durationMinutes: number;
  errorCount: number;
}

export interface DailyUptime {
  /** YYYY-MM-DD */
  date: string;
  uptimePct: number;
  totalChecks: number;
  successfulChecks: number;
}

export interface StatsResponse {
  services: ServiceStats[];
  /** Overall uptime across all services combined */
  overallUptimePct: number;
  /** ISO string of the most recent upload */
  lastUploadAt: string | null;
  /** Total rows in the database */
  totalRows: number;
}

// ─── /api/logs ────────────────────────────────────────────────────────────────

/** A single health-check log row as returned by /api/logs */
export interface LogRow {
  id: number;
  serviceId: string;
  serviceName: string;
  /** ISO UTC string */
  timestampUtc: string;
  statusCode: number;
  latencyMs: number | null;
  agent: string;
  region: string;
  /** Comma-separated quality flag names, empty string if none */
  dataQualityFlags: string;
}

export interface LogsResponse {
  rows: LogRow[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Shared constants ─────────────────────────────────────────────────────────

export const SLA_TARGET = 99.9;

/**
 * Gap in minutes between two checks to still be considered the same
 * incident window. 30 min = 2× the 15-min check interval.
 */
export const INCIDENT_GAP_MINUTES = 30;
