/**
 * cleaner.ts — Data cleaning pipeline for raw CSV rows.
 *
 * Every function here is a pure transformation: input in, output out, no side
 * effects, no DB access. This makes them trivially unit-testable and means the
 * pipeline logic is completely decoupled from transport (upload route) and
 * persistence (DB upsert).
 *
 * Pipeline order (applied per row in cleanRow()):
 *   1. Header guard          — skip stray header rows
 *   2. Required field check  — skip rows missing service_id / timestamp / status
 *   3. Timestamp normalise   — epoch → UTC ISO, tz-offset → UTC ISO
 *   4. Latency unit normalise — seconds → ms
 *   5. Null / empty latency  — set to null + flag
 *   6. Negative latency      — set to null + flag
 *   7. Invalid status code   — flag (keep value for traceability)
 */

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(utc);
dayjs.extend(customParseFormat);

// ─── Types ────────────────────────────────────────────────────────────────────

/** A raw row as PapaParse delivers it — all values are strings. */
export interface RawRow {
  service_id?: string;
  service_name?: string;
  timestamp?: string;
  status_code?: string;
  latency?: string;
  latency_unit?: string;
  agent?: string;
  region?: string;
  [key: string]: string | undefined;
}

/** The result of cleaning a single row. */
export type CleanResult =
  | { ok: true; row: CleanedRow }
  | { ok: false; reason: "header" | "missing_required" };

/** A fully cleaned row ready for DB insertion. */
export interface CleanedRow {
  serviceId: string;
  serviceName: string;
  /** Always a JS Date in UTC — Drizzle/Postgres will persist as TIMESTAMPTZ. */
  timestampUtc: Date;
  statusCode: number;
  /** Normalised to ms. null if missing or physically invalid (negative). */
  latencyMs: number | null;
  agent: string;
  region: string;
  /** Comma-separated quality flag names, empty string if none. */
  dataQualityFlags: string;
}

/** Quality flag names — kept as a union so callers can't mistype them. */
export type QualityFlag =
  | "epoch_timestamp"
  | "tz_normalised"
  | "unit_normalised"
  | "null_latency"
  | "negative_latency"
  | "invalid_status";

// ─── Step 1 — Header guard ────────────────────────────────────────────────────

/**
 * Returns true if this row looks like a stray header line (status_code is
 * not parseable as a number). PapaParse can emit these when the CSV contains
 * a repeated header mid-file.
 */
export function isHeaderRow(raw: RawRow): boolean {
  const sc = raw.status_code?.trim() ?? "";
  // A data row's status_code is always a number. "status_code" or "" → header.
  return sc === "" || isNaN(Number(sc));
}

// ─── Step 2 — Required field check ───────────────────────────────────────────

/**
 * Returns true if the row has the minimum fields needed to be useful.
 * Rows missing any of these are skipped entirely (not flagged).
 */
export function hasMissingRequired(raw: RawRow): boolean {
  return (
    !raw.service_id?.trim() ||
    !raw.timestamp?.trim() ||
    !raw.status_code?.trim()
  );
}

// ─── Step 3 — Timestamp normalisation ─────────────────────────────────────────

/**
 * Normalises the raw timestamp string to a UTC Date.
 *
 * Handles three formats found in the data:
 *   a) Pure 10-digit integer → Unix epoch in seconds → UTC
 *   b) ISO 8601 with non-UTC offset (e.g. +05:30) → UTC
 *   c) ISO 8601 already in UTC (Z suffix) → parse as-is
 *
 * Returns null if the value cannot be parsed as a valid date.
 */
export function normaliseTimestamp(raw: string): {
  date: Date | null;
  flags: QualityFlag[];
} {
  const flags: QualityFlag[] = [];
  const trimmed = raw.trim();

  // a) Pure integer → Unix epoch (seconds)
  if (/^\d{9,11}$/.test(trimmed)) {
    const d = dayjs.unix(parseInt(trimmed, 10)).utc();
    if (!d.isValid()) return { date: null, flags: [] };
    flags.push("epoch_timestamp");
    return { date: d.toDate(), flags };
  }

  // b) & c) ISO string — parse with timezone awareness
  const d = dayjs(trimmed); // dayjs respects embedded offsets
  if (!d.isValid()) return { date: null, flags: [] };

  // If the raw string has a non-UTC offset, flag it
  if (/[+-]\d{2}:\d{2}$/.test(trimmed)) {
    flags.push("tz_normalised");
  }

  return { date: d.utc().toDate(), flags };
}

// ─── Step 4 & 5 & 6 — Latency normalisation ──────────────────────────────────

/**
 * Normalises raw latency value + unit into milliseconds.
 *
 * Rules:
 *   - Empty / absent value → null + null_latency flag
 *   - Valid "s" unit → multiply by 1000, add unit_normalised flag
 *   - Valid "ms" unit → use as-is
 *   - Negative result → null + negative_latency flag (replaces the ms value)
 */
export function normaliseLatency(
  rawValue: string | undefined,
  rawUnit: string | undefined
): { latencyMs: number | null; flags: QualityFlag[] } {
  const flags: QualityFlag[] = [];
  const valStr = rawValue?.trim() ?? "";

  // Step 5: null / empty
  if (valStr === "") {
    flags.push("null_latency");
    return { latencyMs: null, flags };
  }

  const parsed = parseFloat(valStr);

  // Also catches NaN
  if (!isFinite(parsed)) {
    flags.push("null_latency");
    return { latencyMs: null, flags };
  }

  const unit = rawUnit?.trim().toLowerCase() ?? "ms";
  let ms = parsed;

  // Step 4: unit normalisation
  if (unit === "s") {
    ms = parsed * 1000;
    flags.push("unit_normalised");
  }

  // Step 6: negative latency
  if (ms < 0) {
    flags.push("negative_latency");
    return { latencyMs: null, flags };
  }

  return { latencyMs: ms, flags };
}

// ─── Step 7 — Status code validation ─────────────────────────────────────────

/**
 * Returns an invalid_status flag if the code is outside the valid HTTP range
 * (100–599). We keep the raw value for traceability but flag the row.
 */
export function validateStatusCode(code: number): QualityFlag[] {
  if (code < 100 || code > 599) {
    return ["invalid_status"];
  }
  return [];
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

/**
 * Runs the full cleaning pipeline on a single raw row.
 * Returns either a cleaned row or a skip reason.
 */
export function cleanRow(raw: RawRow): CleanResult {
  // Step 1: header guard
  if (isHeaderRow(raw)) {
    return { ok: false, reason: "header" };
  }

  // Step 2: required fields
  if (hasMissingRequired(raw)) {
    return { ok: false, reason: "missing_required" };
  }

  const allFlags: QualityFlag[] = [];

  // Step 3: timestamp
  const { date: timestampUtc, flags: tsFlags } = normaliseTimestamp(
    raw.timestamp!
  );
  if (!timestampUtc) {
    // Unparseable timestamp — cannot use this row
    return { ok: false, reason: "missing_required" };
  }
  allFlags.push(...tsFlags);

  // Steps 4–6: latency
  const { latencyMs, flags: latencyFlags } = normaliseLatency(
    raw.latency,
    raw.latency_unit
  );
  allFlags.push(...latencyFlags);

  // Step 7: status code
  const statusCode = parseInt(raw.status_code!, 10);
  const statusFlags = validateStatusCode(statusCode);
  allFlags.push(...statusFlags);

  return {
    ok: true,
    row: {
      serviceId: raw.service_id!.trim(),
      serviceName: (raw.service_name ?? raw.service_id!).trim(),
      timestampUtc,
      statusCode,
      latencyMs,
      agent: (raw.agent ?? "unknown").trim(),
      region: (raw.region ?? "unknown").trim(),
      dataQualityFlags: allFlags.join(","),
    },
  };
}

// ─── Batch helper ─────────────────────────────────────────────────────────────

export interface BatchCleanResult {
  rows: CleanedRow[];
  rowsProcessed: number;
  rowsFlagged: number;
  rowsSkipped: number;
}

/**
 * Cleans an array of raw rows and returns the cleaned rows plus summary counts.
 * A row is "flagged" if it has any data_quality_flags but is still inserted.
 * A row is "skipped" if cleanRow() returns ok: false.
 */
export function cleanBatch(rawRows: RawRow[]): BatchCleanResult {
  const rows: CleanedRow[] = [];
  let rowsSkipped = 0;
  let rowsFlagged = 0;

  for (const raw of rawRows) {
    const result = cleanRow(raw);
    if (!result.ok) {
      rowsSkipped++;
      continue;
    }
    if (result.row.dataQualityFlags !== "") {
      rowsFlagged++;
    }
    rows.push(result.row);
  }

  return {
    rows,
    rowsProcessed: rawRows.length,
    rowsFlagged,
    rowsSkipped,
  };
}
