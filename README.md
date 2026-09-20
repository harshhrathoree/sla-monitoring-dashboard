# SLA Monitoring Dashboard

A production-grade SLA monitoring pipeline: upload a messy CSV of health-check
logs → serverless cloud function parses & cleans → persisted to Postgres →
single-screen dashboard shows stats + filterable logs.

> **Live URL:** https://sla-monitoring-dashboard.vercel.app
> **Last verified live:** 2025-09-18

---

## Architecture

```
Browser (Vercel CDN)
  ├─ Upload page  →  POST /api/upload  →  Neon Postgres
  └─ Dashboard    →  GET  /api/stats   →  Neon Postgres
                  →  GET  /api/logs    →  Neon Postgres
```

All serverless functions run on Vercel's infrastructure (AWS Lambda under the
hood). The database is Neon Serverless Postgres. See [FLOW.md](./FLOW.md) for
the full end-to-end data flow.

See [DECISIONS.md](./DECISIONS.md) for why each technology was chosen.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Styling | Tailwind CSS v4 |
| Serverless functions | Vercel API Routes (Node.js 20) |
| Database | Neon Serverless Postgres |
| ORM | Drizzle ORM |
| CSV parsing | PapaParse |
| Date/time | Day.js (UTC + customParseFormat plugins) |
| Charts | Recharts |
| Language | TypeScript (strict) |
| Hosting | Vercel (free Hobby tier) |

---

## Data Findings

All data quality issues discovered in the provided CSV files and how they
are handled by the cleaning pipeline:

1. **Unix epoch timestamps** — 10-digit integers instead of ISO strings.
   Detected by checking if the field is a pure integer; converted to UTC ISO.

2. **Non-UTC timezone offsets** — e.g. `2025-05-13T02:00:00+05:30`.
   Parsed with Day.js timezone awareness and normalised to UTC.

3. **Mixed latency units** — `svc-search` reports latency in seconds; all
   other services use milliseconds. The `latency_unit` column is read and
   seconds are multiplied by 1000 before storage.

4. **Null / empty latency** — Some rows have an empty `latency` field.
   Stored as `NULL`; excluded from avg/p99 calculations.

5. **Negative latency** — One instance of `-223 ms` found. Invalid
   measurement; stored as `NULL` with a `negative_latency` flag.

6. **Invalid HTTP status code 999** — Not a real HTTP code (valid range is
   100–599). Kept in the database for traceability but flagged and treated as
   "down" for uptime calculations.

7. **Multi-agent duplicate timestamps** — Same service+timestamp reported by
   both `agent-1` and `agent-2`. This is intentional multi-agent redundancy;
   both rows are preserved. The unique key includes the `agent` field.

8. **Stray header row in data** — The CSV header occasionally appears as a
   data row. Rows where `status_code` is non-numeric are skipped.

---

## Assumptions

- **SLA target = 99.9%** — stated explicitly in the problem spec.
- **"Down" definition** — any check with a non-2xx status code (including 999,
  5xx, etc.) counts as down. Checks with NULL latency but valid 2xx status
  still count as up.
- **Multi-agent checks are independent** — both agent readings count toward
  the total check count. This is consistent with how redundant monitoring
  works in practice (more coverage = better signal).
- **Incident window gap** — consecutive errors within 30 minutes (2× the
  15-min check interval) are grouped into a single incident window.
- **Per-upload, not per-day SLA** — the dashboard shows aggregate uptime
  across the full date range of the uploaded file. Day-level breakdown is
  available in the logs view.

---

## Local Development

### Prerequisites
- Node.js 20+
- A Neon account (free tier) — [neon.tech](https://neon.tech)

### Setup

```bash
# 1. Clone the repo
git clone <repo-url>
cd sla-dashboard

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.local.example .env.local
# Edit .env.local and paste your Neon DATABASE_URL

# 4. Push schema to Neon
npm run db:push

# 5. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Available scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run db:push` | Push schema to DB (dev) |
| `npm run db:generate` | Generate migration files |
| `npm run db:migrate` | Run migrations |
| `npm run db:studio` | Open Drizzle Studio |

---

## Deployment (Vercel + Neon)

1. Push the repo to GitHub.
2. Create a new Vercel project from the GitHub repo.
3. In Vercel dashboard → Settings → Environment Variables, add `DATABASE_URL`
   (from your Neon project's connection string).
4. Deploy. Vercel auto-detects Next.js and deploys everything.
5. Run `npm run db:push` once locally (pointing at the production Neon DB) to
   create the tables.

---

## What I'd Do With More Time

- **Per-day uptime sparklines** — break down uptime by calendar day for each
  service to spot trends.
- **Upload history page** — list all previous uploads with their summaries
  and allow re-querying any batch.
- **CSV preview** — show a sample of rows before confirming the upload.
- **Export** — allow the filtered log view to be exported as CSV.
- **Incident detection tuning** — make the gap threshold configurable.
- **E2E tests** — Playwright tests for the upload flow and dashboard filters.
- **Rate limiting** — add basic IP-based rate limiting on the upload endpoint
  to prevent abuse (out of scope per spec, but important for a real product).
