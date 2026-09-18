import {
  pgTable,
  serial,
  varchar,
  timestamp,
  smallint,
  real,
  text,
  uuid,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── upload_batches ────────────────────────────────────────────────────────────
// One row per CSV upload. Lets us trace every monitoring_check row back to the
// specific file that produced it, and lets the UI show a per-upload summary.
export const uploadBatches = pgTable("upload_batches", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  filename: varchar("filename", { length: 255 }).notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  rowsProcessed: smallint("rows_processed").notNull().default(0),
  rowsInserted: smallint("rows_inserted").notNull().default(0),
  rowsFlagged: smallint("rows_flagged").notNull().default(0),
  rowsSkipped: smallint("rows_skipped").notNull().default(0),
});

// ─── monitoring_checks ────────────────────────────────────────────────────────
// The cleaned, normalised health-check rows. One row = one agent check on one
// service at one point in time. Latency is always stored in ms (normalised from
// the raw unit). Timestamps are always UTC (normalised from epoch or tz-offset).
export const monitoringChecks = pgTable(
  "monitoring_checks",
  {
    id: serial("id").primaryKey(),

    // Service identity
    serviceId: varchar("service_id", { length: 50 }).notNull(),
    serviceName: varchar("service_name", { length: 100 }).notNull(),

    // Normalised timestamp — always stored as UTC
    timestampUtc: timestamp("timestamp_utc", { withTimezone: true }).notNull(),

    // HTTP response
    statusCode: smallint("status_code").notNull(),

    // Latency normalised to milliseconds; NULL if missing or invalid (negative)
    latencyMs: real("latency_ms"),

    // Agent / region that produced this check
    agent: varchar("agent", { length: 50 }).notNull(),
    region: varchar("region", { length: 50 }).notNull(),

    // Data-quality flags set by the cleaning pipeline.
    // Stored as a comma-separated string (Postgres text[]) would require
    // array support; using text with CSV values keeps it simple.
    // Possible values: epoch_timestamp | tz_normalised | null_latency |
    //                  negative_latency | invalid_status | unit_normalised
    dataQualityFlags: text("data_quality_flags").default(""),

    // FK back to the upload that inserted this row
    uploadBatchId: uuid("upload_batch_id")
      .notNull()
      .references(() => uploadBatches.id, { onDelete: "cascade" }),
  },
  (table) => [
    // Unique constraint: one agent can only report one result per service per
    // 15-min slot. This is the deduplication key for upserts.
    unique("uq_check_key").on(
      table.serviceId,
      table.timestampUtc,
      table.agent
    ),

    // Query patterns we need fast:
    index("idx_service_id").on(table.serviceId),
    index("idx_timestamp_utc").on(table.timestampUtc),
    index("idx_status_code").on(table.statusCode),
    index("idx_upload_batch").on(table.uploadBatchId),
  ]
);

// ─── TypeScript types (inferred from schema) ──────────────────────────────────
export type UploadBatch = typeof uploadBatches.$inferSelect;
export type NewUploadBatch = typeof uploadBatches.$inferInsert;
export type MonitoringCheck = typeof monitoringChecks.$inferSelect;
export type NewMonitoringCheck = typeof monitoringChecks.$inferInsert;
