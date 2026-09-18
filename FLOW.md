# FLOW.md — SLA Monitoring Dashboard: Complete Data & Application Flow

> This document is the single source of truth for **how data moves** through
> this system — from a raw CSV file on a user's machine to the numbers shown
> on the dashboard. Every stage is described end-to-end with the decisions
> that shape each step.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Stage 1 — Upload UI](#2-stage-1--upload-ui)
3. [Stage 2 — Serverless Upload Function](#3-stage-2--serverless-upload-function)
4. [Stage 3 — Data Cleaning Pipeline (inside the function)](#4-stage-3--data-cleaning-pipeline)
5. [Stage 4 — Database Persistence](#5-stage-4--database-persistence)
6. [Stage 5 — Query API Routes](#6-stage-5--query-api-routes)
7. [Stage 6 — Dashboard UI](#7-stage-6--dashboard-ui)
8. [Data Quality Issues & Handling](#8-data-quality-issues--handling)
9. [SLA Calculation Logic](#9-sla-calculation-logic)
10. [Database Schema](#10-database-schema)
11. [Environment & Configuration](#11-environment--configuration)

---

## 1. High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                        VERCEL (free Hobby tier)                     │
│                                                                      │
│  ┌──────────────┐   multipart/form-data    ┌──────────────────────┐ │
│  │  Upload Page  │ ───────────────────────► │  /api/upload         │ │
│  │  (Next.js)    │                          │  Serverless Function │ │
│  └──────────────┘                          │  (Node.js runtime)   │ │
│                                            └──────────┬───────────┘ │
│  ┌──────────────┐   GET /api/stats                    │ batch upsert│
│  │  Dashboard    │ ◄─────────────────────────────────┐│             │
│  │  (Next.js)    │   GET /api/logs?...                ││             │
│  └──────────────┘ ◄─────────────────────────────────┐│▼             │
│                                            ┌──────────┴───────────┐ │
│                                            │   /api/stats          │ │
│                                            │   /api/logs           │ │
│                                            │  (Serverless Funcs)  │ │
│                                            └──────────┬───────────┘ │
└────────────────────────────────────────────────────────┼────────────┘
                                                         │ SQL (neon-http)
                                              ┌──────────▼───────────┐
                                              │   Neon Serverless     │
                                              │   Postgres            │
                                              │   (free tier, 0.5 GB) │
                                              └──────────────────────┘
```

**Key constraint satisfied:** The `/api/upload` route is a real Vercel
Serverless Function — it runs in Vercel's cloud infrastructure, not locally
or in a container, fulfilling the problem statement's requirement.

---

## 2. Stage 1 — Upload UI

**Route:** `/` (Next.js App Router page)

### User actions
1. User opens the root page (`/`).
2. Drags a `.csv` file onto the drop zone **or** clicks to open a file picker.
3. The file is read client-side to show the filename and estimated row count
   (via a quick line-count scan — no full parse in the browser).
4. User clicks **Upload**. The file is `POST`-ed to `/api/upload` as
   `multipart/form-data` with the field name `file`.
5. A progress bar shows while the request is in flight.
6. On success, a result card is shown:
   - Rows processed
   - Rows inserted (new)
   - Rows flagged (data quality issues found)
   - Rows skipped (duplicates)
   - Link to the Dashboard

### What does NOT happen in the browser
- No CSV parsing. The browser only reads the raw bytes and sends them.
- No validation. All validation happens in the serverless function.
- No state persistence. The page is stateless.

---

## 3. Stage 2 — Serverless Upload Function

**Route:** `POST /api/upload`  
**Runtime:** Vercel Serverless Function, Node.js 20  
**File:** `src/app/api/upload/route.ts`

### Responsibilities
1. Receive the `multipart/form-data` request.
2. Extract the CSV file buffer.
3. Pass the buffer through the **Data Cleaning Pipeline** (Stage 3).
4. Batch-upsert the cleaned rows into Neon (Stage 4).
5. Return a JSON summary.

### Size limit
Vercel's default request body limit is 4.5 MB. For larger files, the
function config raises this to 10 MB — enough for all provided datasets.

### Response shape
```json
{
  "batchId": "uuid-v4",
  "filename": "monitoring_checks_30d_seed404.csv",
  "rowsProcessed": 15577,
  "rowsInserted": 15432,
  "rowsFlagged": 312,
  "rowsSkipped": 145,
  "durationMs": 2840
}
```

---

## 4. Stage 3 — Data Cleaning Pipeline

**File:** `src/lib/cleaner.ts`

This is the core logic. Every row from PapaParse flows through a sequence of
deterministic transformations. Each step either fixes a value or attaches a
flag to the row.

### Pipeline steps (applied in order per row)

```
Raw CSV row
    │
    ▼
[1] Header guard
    │  Skip rows where status_code is non-numeric (stray header repeats)
    │
    ▼
[2] Timestamp normalisation
    │  a) Pure 10-digit integer → treat as Unix epoch (seconds) → ISO UTC
    │     flag: epoch_timestamp
    │  b) ISO string with non-Z timezone offset (e.g. +05:30) → parse with
    │     timezone awareness → convert to UTC
    │     flag: tz_normalised
    │  c) Already ISO UTC (Z suffix) → parse as-is, no flag
    │
    ▼
[3] Latency unit normalisation
    │  Read latency_unit column:
    │  - "ms" → store value as-is (already milliseconds)
    │  - "s"  → multiply by 1000 → store in ms
    │            flag: unit_normalised
    │
    ▼
[4] Null / missing latency
    │  Empty string or absent value → set latencyMs = null
    │  flag: null_latency
    │
    ▼
[5] Negative latency
    │  Value < 0 → set latencyMs = null (cannot be a valid measurement)
    │  flag: negative_latency
    │
    ▼
[6] Invalid HTTP status code
    │  Valid range: 100–599 (per RFC 7231)
    │  Out-of-range (e.g. 999) → keep raw value for traceability, set flag
    │  flag: invalid_status
    │
    ▼
[7] Missing required fields
    │  If service_id, timestamp, or status_code is absent → skip row entirely
    │  (counted in rowsSkipped, not rowsFlagged)
    │
    ▼
Cleaned row ready for upsert
```

### Flag accumulation
A row can carry multiple flags. They are stored as a comma-separated string
in the `data_quality_flags` column, e.g. `"epoch_timestamp,null_latency"`.

### Multi-agent duplicates
The unique key is `(service_id, timestamp_utc, agent)`. If two different
agents report the same service at the same timestamp, **both rows are kept**
— that is intentional multi-agent redundancy, not a bug.

True duplicates (identical triplet) are handled by the database upsert:
`ON CONFLICT DO NOTHING`. They count as `rowsSkipped`.

---

## 5. Stage 4 — Database Persistence

**DB:** Neon Serverless Postgres (free tier)  
**ORM:** Drizzle ORM with `neon-http` driver

### Tables

| Table | Purpose |
|-------|---------|
| `upload_batches` | One row per upload event; stores summary counts |
| `monitoring_checks` | One row per cleaned health-check; FK to upload_batches |

### Upsert strategy
Rows are written in batches of **500** using Drizzle's
`onConflictDoNothing()` on the unique constraint
`(service_id, timestamp_utc, agent)`.

Batching avoids hitting Neon's connection limits and keeps each INSERT
statement within Postgres's parameter limit (~65 535 parameters).

### After insert
The `upload_batches` row is updated with final counts
(rows_processed, rows_inserted, rows_flagged, rows_skipped).

---

## 6. Stage 5 — Query API Routes

### `GET /api/stats`
**File:** `src/app/api/stats/route.ts`

Returns per-service aggregates used by the stats section:

```sql
SELECT
  service_id,
  service_name,
  COUNT(*)                                              AS total_checks,
  COUNT(*) FILTER (WHERE status_code BETWEEN 200 AND 299) AS successful_checks,
  ROUND(
    COUNT(*) FILTER (WHERE status_code BETWEEN 200 AND 299)::numeric
    / COUNT(*)::numeric * 100, 4
  )                                                     AS uptime_pct,
  AVG(latency_ms) FILTER (WHERE latency_ms IS NOT NULL)  AS avg_latency_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms)
    FILTER (WHERE latency_ms IS NOT NULL)               AS p99_latency_ms,
  MIN(timestamp_utc)                                    AS first_check,
  MAX(timestamp_utc)                                    AS last_check
FROM monitoring_checks
GROUP BY service_id, service_name
ORDER BY service_id;
```

SLA breach is computed in application code:
`uptime_pct < 99.9 → sla_breached = true`.

### `GET /api/logs`
**File:** `src/app/api/logs/route.ts`

Accepts query params:
- `service` — filter by service_id (optional)
- `from` — ISO date string, start of range (optional)
- `to` — ISO date string, end of range (optional)
- `status` — `ok` | `error` | `flagged` (optional)
- `page` — 1-based page number (default: 1)
- `limit` — rows per page (default: 50, max: 200)

Returns paginated rows plus `totalCount` for the client to render pagination.

---

## 7. Stage 6 — Dashboard UI

**Route:** `/dashboard`  
**File:** `src/app/dashboard/page.tsx`

### Layout

```
┌────────────────────────────────────────────────────────┐
│  SLA Monitoring Dashboard          [▲ Collapse Stats]  │
├────────────────────────────────────────────────────────┤
│  STATS SECTION (collapsible)                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ svc-auth │ │svc-notify│ │svc-paym..│ │svc-repor│ │
│  │  ✓ 99.97%│ │  ✗ 99.7% │ │  ✓ 99.9+ │ │  ✓ 99.9+│ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
│                                                        │
│  [Uptime bar chart per service]                        │
│  [Avg / P99 latency table]                             │
│  [Incident windows list]                               │
├────────────────────────────────────────────────────────┤
│  LOGS SECTION                                          │
│  Filter: [Service ▼] [From date] [To date] [Status ▼] │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Timestamp  │ Service │ Status │ Latency │ Agent  │  │
│  │ ...        │ ...     │ ...    │ ...     │ ...    │  │
│  └──────────────────────────────────────────────────┘  │
│  [← Prev]  Page 1 of 312  [Next →]                    │
└────────────────────────────────────────────────────────┘
```

### Stats section details
- **Service cards** — one card per service showing: uptime %, SLA status
  (green ✓ / red ✗), total checks, error count, avg latency ms
- **Uptime bar chart** — horizontal bars, one per service, showing uptime %
  with 99.9% SLA threshold line
- **Latency table** — avg and p99 latency per service
- **Incident windows** — derived from consecutive 5xx runs; shows service,
  start time, end time, and duration

### Logs section details
- Columns: timestamp (UTC), service, status code, latency (ms), agent,
  region, quality flags
- Status codes coloured: green for 2xx, red for 5xx, orange for others
- Quality flags shown as small badges on the row
- Pagination: 50 rows per page with prev/next controls

---

## 8. Data Quality Issues & Handling

All issues were discovered by inspecting the raw CSV files before writing
any code. The full list:

| # | Issue | Prevalence | Handling |
|---|-------|-----------|---------|
| 1 | Unix epoch timestamps (10-digit int) | ~dozens per file | Detect pure-digit field → parse as seconds → UTC |
| 2 | Non-UTC timezone offsets (+05:30) | ~dozens per file | Parse with Day.js tz-aware → convert to UTC |
| 3 | Mixed latency units (s vs ms) | All svc-search rows | Read `latency_unit` col; × 1000 if "s" |
| 4 | Null / empty latency | ~5–10 per file | Store NULL; exclude from aggregates |
| 5 | Negative latency (-223 ms) | Rare | Store NULL; flag row |
| 6 | Invalid HTTP status 999 | 3 rows across files | Keep value; flag row; exclude from uptime calc |
| 7 | Multi-agent duplicate timestamps | Many rows | Intentional; unique key includes agent |
| 8 | Stray header row in data | Rare | Skip rows where status_code is non-numeric |

---

## 9. SLA Calculation Logic

```
uptime_pct = (checks_with_2xx_status / total_checks) × 100

SLA target  = 99.9%
SLA breach  = uptime_pct < 99.9

Rows excluded from uptime denominator: NONE
  → Every check counts. A check with status 999 counts as "down."
  → A check with NULL latency but valid 2xx status still counts as "up."

Incident window = consecutive run of non-2xx checks for the same service,
  sorted by timestamp_utc, gap between checks ≤ 30 min (2× the 15-min interval).
```

---

## 10. Database Schema

### `upload_batches`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| filename | VARCHAR(255) | original filename |
| uploaded_at | TIMESTAMPTZ | server time of upload |
| rows_processed | SMALLINT | total rows seen |
| rows_inserted | SMALLINT | new rows written |
| rows_flagged | SMALLINT | rows with quality flags |
| rows_skipped | SMALLINT | duplicates / invalid |

### `monitoring_checks`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| service_id | VARCHAR(50) | e.g. svc-auth |
| service_name | VARCHAR(100) | e.g. auth-api |
| timestamp_utc | TIMESTAMPTZ | always UTC |
| status_code | SMALLINT | raw HTTP code |
| latency_ms | REAL | normalised to ms; NULL if invalid |
| agent | VARCHAR(50) | e.g. agent-1 |
| region | VARCHAR(50) | e.g. ap-south-1 |
| data_quality_flags | TEXT | comma-separated flag names |
| upload_batch_id | UUID FK | → upload_batches.id CASCADE DELETE |

**Unique constraint:** `(service_id, timestamp_utc, agent)`  
**Indexes:** service_id, timestamp_utc, status_code, upload_batch_id

---

## 11. Environment & Configuration

| Variable | Where set | Purpose |
|----------|-----------|---------|
| `DATABASE_URL` | Vercel env / `.env.local` | Neon connection string with SSL |

No other secrets or configuration are required. The app is intentionally
stateless at the function layer — all state lives in Neon.
