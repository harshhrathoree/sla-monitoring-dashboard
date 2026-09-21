# FLOW.md — SLA Monitoring Dashboard: Complete Data & Application Flow

> This document is the single source of truth for **how data moves** through
> this system — from a raw CSV file on a user's machine to the numbers shown
> on the dashboard. Every stage is described end-to-end with the decisions
> that shape each step.
>
> **Last updated:** reflects the final deployed state at
> `https://sla-monitoring-dashboard.vercel.app`

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Full Route Map](#2-full-route-map)
3. [Stage 1 — Upload UI](#3-stage-1--upload-ui)
4. [Stage 2 — Serverless Upload Function](#4-stage-2--serverless-upload-function)
5. [Stage 3 — Data Cleaning Pipeline](#5-stage-3--data-cleaning-pipeline)
6. [Stage 4 — Database Persistence](#6-stage-4--database-persistence)
7. [Stage 5 — Query API Routes](#7-stage-5--query-api-routes)
8. [Stage 6 — Dashboard UI](#8-stage-6--dashboard-ui)
9. [Data Quality Issues & Handling](#9-data-quality-issues--handling)
10. [SLA Calculation Logic](#10-sla-calculation-logic)
11. [Incident Detection Logic](#11-incident-detection-logic)
12. [Database Schema](#12-database-schema)
13. [Key Architectural Decision — No Internal HTTP Fetch](#13-key-architectural-decision--no-internal-http-fetch)
14. [Environment & Configuration](#14-environment--configuration)

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VERCEL (free Hobby tier)                      │
│                                                                       │
│  ┌───────────────┐  multipart/form-data   ┌──────────────────────┐  │
│  │  Upload Page  │ ─────────────────────► │  POST /api/upload    │  │
│  │  /            │                        │  Serverless Function │  │
│  │  (SSG)        │  GET /api/uploads      │  (Node.js 20)        │  │
│  │               │ ◄───────────────────── └──────────┬───────────┘  │
│  └───────────────┘                                   │ batch upsert │
│                                                       ▼              │
│  ┌───────────────┐  getStats() direct call  ┌────────────────────┐  │
│  │  Dashboard    │ ────────────────────────►│  lib/getStats.ts   │  │
│  │  /dashboard   │                          │  (shared query fn) │  │
│  │  (SSR, force- │  GET /api/logs?...        └────────┬───────────┘  │
│  │   dynamic)    │ ◄─────────────────────────────────┐│             │
│  └───────────────┘                         ┌─────────┴┴──────────┐  │
│                                            │  /api/logs           │  │
│                                            │  /api/stats (wrap)   │  │
│                                            │  /api/uploads        │  │
│                                            │  /api/clear-data     │  │
│                                            │  (Serverless Funcs)  │  │
│                                            └──────────┬───────────┘  │
└───────────────────────────────────────────────────────┼─────────────┘
                                                        │ SQL (neon-http)
                                             ┌──────────▼───────────┐
                                             │   Neon Serverless     │
                                             │   Postgres            │
                                             │   (free tier, 0.5 GB) │
                                             └──────────────────────┘
```

**Key constraint satisfied:** Every `/api/*` route is a real Vercel Serverless
Function running on AWS Lambda-backed Vercel infrastructure — not locally, not
in a container. This fulfils the spec's "must actually run in the cloud"
requirement.

---

## 2. Full Route Map

| Route | Type | Purpose |
|-------|------|---------|
| `GET /` | Static (SSG) | Upload page — drag-and-drop CSV + upload history |
| `GET /dashboard` | Dynamic (SSR) | SLA stats + filterable log table |
| `POST /api/upload` | Serverless | Receive CSV → clean → upsert to Neon |
| `GET /api/stats` | Serverless | Per-service SLA aggregates (wraps `getStats()`) |
| `GET /api/logs` | Serverless | Paginated, filtered health-check rows |
| `GET /api/uploads` | Serverless | Last 20 upload batch summaries |
| `DELETE /api/clear-data` | Serverless | TRUNCATE all rows (with UI confirmation) |

---

## 3. Stage 1 — Upload UI

**Route:** `/` (Next.js App Router, statically generated)  
**Files:** `src/app/page.tsx`, `src/components/UploadPageClient.tsx`,
`src/components/UploadForm.tsx`, `src/components/UploadHistory.tsx`

### Component tree

```
page.tsx (Server Component)
  └── UploadPageClient (Client Component — owns refreshKey state)
        ├── UploadForm       — drag-and-drop + upload state machine
        └── UploadHistory    — fetches /api/uploads, re-fetches on success
```

### Upload state machine (inside UploadForm)

```
idle
  │  user selects file
  ▼
file_selected
  │  user clicks "Upload & Process"
  ▼
uploading  ──── POST /api/upload ──────►  success
                                    └──►  error (shows banner, returns to idle)
```

### On success
1. `UploadResultCard` shown: rows processed / inserted / flagged / skipped + duration
2. `onUploadSuccess()` callback fires → `refreshKey` increments → `UploadHistory`
   re-fetches and shows the new batch at the top of the list
3. "View Dashboard" link navigates to `/dashboard`

### What does NOT happen in the browser
- No CSV parsing — the browser reads raw bytes and POSTs them.
- No validation — all validation happens in the serverless function.
- No persistent state — the page is otherwise stateless.

---

## 4. Stage 2 — Serverless Upload Function

**Route:** `POST /api/upload`  
**Runtime:** Vercel Serverless Function, Node.js 20  
**File:** `src/app/api/upload/route.ts`  
**Max duration:** 60 s (configured via `export const maxDuration = 60`)

### Responsibilities
1. Receive `multipart/form-data`, extract the `file` field.
2. Validate: must be `.csv`, non-empty.
3. Parse with **PapaParse** (`dynamicTyping: false` — all values stay as strings
   so the cleaning pipeline controls all type coercions).
4. Run the **Data Cleaning Pipeline** (`src/lib/cleaner.ts`).
5. Insert an `upload_batches` row to obtain a UUID batch ID.
6. Batch-upsert cleaned rows in chunks of 500 with `ON CONFLICT DO NOTHING`.
7. Update `upload_batches` with final counts.
8. Return a JSON summary.

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

## 5. Stage 3 — Data Cleaning Pipeline

**File:** `src/lib/cleaner.ts`

All functions are **pure** — no side effects, no DB access. This makes them
independently unit-testable. 39 unit tests cover every rule and edge case.

### Pipeline steps (applied in order per row)

```
Raw CSV row (all values as strings)
    │
    ▼
[1] Header guard
    │  status_code non-numeric → skip (reason: "header")
    │
    ▼
[2] Required field check
    │  Missing service_id / timestamp / status_code → skip (reason: "missing_required")
    │
    ▼
[3] Timestamp normalisation
    │  a) Pure 9–11 digit integer → Unix epoch (seconds) → UTC ISO
    │     flag: epoch_timestamp
    │  b) ISO string with non-Z offset (e.g. +05:30) → parse tz-aware → UTC
    │     flag: tz_normalised
    │  c) ISO UTC (Z suffix) → parse as-is, no flag
    │  d) Unparseable → skip (reason: "missing_required")
    │
    ▼
[4] Latency unit normalisation
    │  latency_unit = "s"  → value × 1000 → stored in ms
    │                         flag: unit_normalised
    │  latency_unit = "ms" → store as-is
    │
    ▼
[5] Null / missing latency
    │  Empty string or absent → latencyMs = null
    │  flag: null_latency
    │
    ▼
[6] Negative latency
    │  value < 0 → latencyMs = null (physically impossible)
    │  flag: negative_latency
    │
    ▼
[7] Invalid HTTP status code
    │  Outside 100–599 (RFC 7231) → keep raw value, add flag
    │  flag: invalid_status
    │
    ▼
Cleaned row — ready for DB upsert
```

### Flag accumulation
A single row can carry multiple flags stored as a comma-separated string:
`"epoch_timestamp,null_latency"`. The dashboard renders these as amber badges
on the log row.

### Multi-agent deduplication
Unique key: `(service_id, timestamp_utc, agent)`.
- Same service + same timestamp + **different agents** → both rows kept (intentional redundancy).
- Identical triplet → `ON CONFLICT DO NOTHING` → counted as `rowsSkipped`.

---

## 6. Stage 4 — Database Persistence

**DB:** Neon Serverless Postgres  
**ORM:** Drizzle ORM with `neon-http` driver  
**Connection:** Lazy `getDb()` factory — no module-load-time connection,
safe for Next.js build environments without `DATABASE_URL`.

### Batch upsert
Rows upserted in chunks of **500** to stay within Postgres's 65 535-parameter
limit (9 params × 500 = 4 500 per statement). Each chunk uses:
```sql
INSERT INTO monitoring_checks (...) VALUES (...)
ON CONFLICT (service_id, timestamp_utc, agent) DO NOTHING
RETURNING id
```
`rowsInserted = COUNT(RETURNING)`. DB-level duplicates = `cleanedRows.length − rowsInserted`.

### Clear data
`DELETE /api/clear-data` runs:
```sql
TRUNCATE TABLE upload_batches, monitoring_checks RESTART IDENTITY CASCADE
```
Cascade handles the FK. Sequence reset means IDs restart from 1 on next upload.

---

## 7. Stage 5 — Query API Routes

### `GET /api/stats` — wraps `src/lib/getStats.ts`

The actual query logic lives in `getStats()` — a plain async function shared
by both `/api/stats` (HTTP) and the dashboard Server Component (direct call,
no HTTP round-trip). Five SQL queries run in sequence:

| Query | SQL highlights |
|-------|---------------|
| Per-service aggregates | `COUNT FILTER`, `AVG FILTER`, `PERCENTILE_CONT(0.99)` |
| Per-service per-day | `DATE_TRUNC('day', timestamp_utc)` group-by |
| Error timestamps | All non-2xx rows sorted by time → incident builder |
| Latest upload time | `ORDER BY uploaded_at DESC LIMIT 1` |
| Total row count | `COUNT(*)` |

### `GET /api/logs`

Dynamic `WHERE` clause built by reducing `sql` fragments:

```
?service=svc-auth     → WHERE service_id = 'svc-auth'
?from=2025-05-01      → AND timestamp_utc >= '2025-05-01'::timestamptz
?to=2025-05-10        → AND timestamp_utc < '2025-05-11'::timestamptz  (next day)
?status=error         → AND (status_code < 200 OR status_code > 299)
?status=flagged       → AND data_quality_flags IS NOT NULL AND data_quality_flags != ''
```

Pagination: `LIMIT {limit} OFFSET {(page-1)*limit}`. A separate `COUNT(*)` with
the same `WHERE` provides `totalCount` for the client-side pagination controls.

### `GET /api/uploads`

Returns last 20 `upload_batches` rows, newest first. Powers the upload history
table on the upload page.

---

## 8. Stage 6 — Dashboard UI

**Route:** `/dashboard` — `force-dynamic` SSR  
**File:** `src/app/dashboard/page.tsx`

### Data flow on page load

```
Browser requests /dashboard
       │
       ▼
Next.js Server Component renders
       │
       ├── getStats() called directly (DB query, no HTTP)
       │         │
       │         └── StatsSection rendered with data as props (SSR)
       │
       └── LogsSection rendered as client shell (data fetched client-side)
                 │
                 └── useEffect → GET /api/logs?page=1&limit=50
```

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  NavBar: [● SLA Monitor]                    [Upload] [Dashboard] │
├──────────────────────────────────────────────────────────────────┤
│  Dashboard heading          [Clear all data ▼]  [↑ Upload CSV]  │
├──────────────────────────────────────────────────────────────────┤
│  ▼ SLA Statistics  98.7% overall  ● 5 breaches  27,903 rows     │  ← collapsible header
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│  SERVICE SLA STATUS (5 services)                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ auth-api │ │notify-w..│ │payments..│ │reports-a │ │search-a│ │
│  │ ✗ 99.22% │ │ ✗ 99.19% │ │ ✗ 98.98% │ │ ✗ 97.10% │ │✗ 99.14%│ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────┘ │
│                                                                    │
│  UPTIME % PER SERVICE  [bar chart, 98%–100% Y-axis, SLA line]    │
│                                                                    │
│  RESPONSE LATENCY          │  INCIDENT WINDOWS (35)              │
│  service  avg    p99  days │  30m  search-api  16 May...         │
│  auth-api 145ms 191ms 10d  │  0m   search-api  16 May...         │
│  ...                       │  0m   reports-api 15 May...         │
│                            │  [Show 30 more incidents ▼]         │
│                            │  (expands into 288px scroll box)     │
├──────────────────────────────────────────────────────────────────┤
│  Health Check Logs  4,665 rows                                    │
│  [All services ▼] [from date] [to date] [All statuses ▼]        │
│  Timestamp UTC  │ Service │ Status │ Latency │ Agent │ Flags     │
│  ...            │ ...     │  200   │ 145ms   │ ...   │           │
│  [← Prev]  Page 1 of 94  [1][2][3][4][5]  [Next →]             │
└──────────────────────────────────────────────────────────────────┘
```

### Uptime chart Y-axis
- Any service below 99% → floor at **95%**
- All services above 99% → floor at **98%**
- Prevents the "all bars look equal" problem when zooming to e.g. 99.99%–100%

### Incident windows
- Collapsed: shows top 5 incidents (most recent first)
- Expanded: all incidents in a **fixed-height 288px scrollable box** with a
  4px thin scrollbar — the layout never blows out regardless of incident count

### Clear all data
Two-step confirmation: click "Clear all data" → inline prompt with "Yes, clear"
/ "Cancel" → `DELETE /api/clear-data` → `router.refresh()` reloads to empty state.

---

## 9. Data Quality Issues & Handling

All issues were discovered by directly inspecting the raw CSV files before
writing any code. Reproducing the full dataset log is in `dataset_incident_log.json`.

| # | Issue | Where found | Handling |
|---|-------|------------|---------|
| 1 | Unix epoch timestamps (10-digit int) | All files | Detect pure-digit field → parse as Unix seconds → UTC ISO |
| 2 | Non-UTC timezone offsets (`+05:30`) | All files | Day.js tz-aware parse → `.utc().toISOString()` |
| 3 | Mixed latency units (`s` vs `ms`) | All `svc-search` rows | Read `latency_unit` col; multiply by 1000 if `"s"` |
| 4 | Null / empty latency | ~5–10 per file | Store `NULL`; exclude from `AVG`/`PERCENTILE_CONT` |
| 5 | Negative latency (`-223 ms`) | Rare (1–2 rows) | Store `NULL`; flag `negative_latency` |
| 6 | Invalid HTTP status `999` | 3 rows across files | Keep value for traceability; flag `invalid_status`; counts as "down" |
| 7 | Multi-agent duplicate timestamps | Many rows | Intentional — unique key includes `agent`; both rows preserved |
| 8 | Stray header row in data body | Rare | Skip rows where `status_code` is non-numeric |

---

## 10. SLA Calculation Logic

```
uptime_pct = (checks_with_2xx_status / total_checks) × 100

SLA target  = 99.9%
SLA breach  = uptime_pct < 99.9

Inclusion rules:
  ✓ Every check counts in the denominator — no exclusions
  ✓ status 999 → counts as "down"
  ✓ NULL latency + valid 2xx status → counts as "up"
  ✓ Multi-agent checks are independent — both count separately

Aggregation scope: across the full date range of all uploaded data.
Per-day breakdown is available via the daily_uptime array in the stats response.
```

---

## 11. Incident Detection Logic

**File:** `src/lib/getStats.ts` → `buildIncidents()`

```
Input: all non-2xx timestamps for one service, sorted chronologically

Algorithm:
  windowStart = first error
  windowEnd   = first error
  errorCount  = 1

  for each subsequent error:
    gap = current.time − previous.time (minutes)

    if gap ≤ 30:           ← 30 min = 2× the 15-min check interval
      extend window (windowEnd = current, errorCount++)
    else:
      close window → push Incident
      start new window at current

  push final open window

Output: Incident[]  { startTime, endTime, durationMinutes, errorCount }
```

**Gap threshold = 30 minutes** — chosen as 2× the check interval. A single
missed check (agent offline, network blip) does not artificially split one
incident into two.

---

## 12. Database Schema

### `upload_batches`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `filename` | VARCHAR(255) | Original uploaded filename |
| `uploaded_at` | TIMESTAMPTZ | Server-side timestamp; default `NOW()` |
| `rows_processed` | SMALLINT | Total rows PapaParse produced |
| `rows_inserted` | SMALLINT | Rows actually written to DB |
| `rows_flagged` | SMALLINT | Rows written with at least one quality flag |
| `rows_skipped` | SMALLINT | Rows dropped (header, missing required, DB conflict) |

### `monitoring_checks`
| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL PK | Auto-increment |
| `service_id` | VARCHAR(50) | e.g. `svc-auth` |
| `service_name` | VARCHAR(100) | e.g. `auth-api` |
| `timestamp_utc` | TIMESTAMPTZ | Always UTC; normalised from epoch/offset |
| `status_code` | SMALLINT | Raw HTTP code (including invalid values like 999) |
| `latency_ms` | REAL | Normalised to ms; `NULL` if missing or invalid |
| `agent` | VARCHAR(50) | e.g. `agent-1` |
| `region` | VARCHAR(50) | e.g. `ap-south-1` |
| `data_quality_flags` | TEXT | Comma-separated flag names; `""` if clean |
| `upload_batch_id` | UUID FK | → `upload_batches.id` ON DELETE CASCADE |

**Unique constraint:** `uq_check_key (service_id, timestamp_utc, agent)`  
**Indexes:** `idx_service_id`, `idx_timestamp_utc`, `idx_status_code`, `idx_upload_batch`

---

## 13. Key Architectural Decision — No Internal HTTP Fetch

The dashboard Server Component (`/dashboard`) **calls `getStats()` directly**
as a TypeScript function rather than fetching `https://.../api/stats` over HTTP.

**Why this matters:** Vercel serverless functions cannot reliably make
loopback HTTP requests to themselves during SSR — the request would need to
leave Vercel's edge, traverse the internet, and re-enter the same function.
This caused a hard crash (`ERROR 512871464`) in the initial deployment.

**The fix:** Query logic lives in `src/lib/getStats.ts` — a plain async
function imported by both:
- `src/app/dashboard/page.tsx` → called directly at SSR render time
- `src/app/api/stats/route.ts` → called when clients hit the API endpoint

This keeps the code DRY and eliminates the fragile loopback pattern entirely.

---

## 14. Environment & Configuration

| Variable | Where set | Purpose |
|----------|-----------|---------|
| `DATABASE_URL` | Vercel env vars / `.env.local` | Neon Postgres connection string with `?sslmode=require` |

No other environment variables are required. The entire application state
lives in Neon — Vercel functions are stateless.
