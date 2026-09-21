# DECISIONS.md — Architecture & Design Decisions

> Every meaningful choice made in this project is documented here with the
> reasoning behind it. The goal is that anyone reading this — including a
> reviewer — can understand *why* each decision was made, not just *what* was
> decided. Alternatives considered are listed where relevant.
>
> **Last updated:** reflects all decisions through final deployed state.

---

## 1. Framework — Next.js 14 (App Router)

**Decision:** Use Next.js 14 with the App Router as the single framework for
both the frontend pages and the serverless API routes.

**Why:**
- The App Router's `src/app/api/*/route.ts` convention makes Vercel
  automatically deploy each route as a separate serverless function. This
  satisfies the "real deployed serverless function" requirement without
  needing a separate Lambda/GCF project.
- Next.js + Vercel is zero-config: `git push` → deployed. No Dockerfile, no
  build pipeline, no infra config needed.
- Server Components allow direct DB calls at SSR time — the dashboard page
  calls `getStats()` as a plain function without an HTTP round-trip.

**Alternatives considered:**
- **React + Vite + separate Express/Lambda:** More moving parts, harder to
  deploy cohesively on free tier.
- **SvelteKit:** Excellent for this use case, but the React ecosystem
  (Recharts, PapaParse) is more familiar and better documented.
- **Remix:** Good option, but Vercel's native Next.js support edges it out
  for zero-config deployment.

---

## 2. Serverless Function — Vercel API Routes (Node.js)

**Decision:** Use Vercel's built-in serverless functions (`/api` routes) as
the "real deployed cloud function" required by the spec.

**Why:**
- They are genuine AWS Lambda-backed functions deployed on Vercel's
  infrastructure — not a local process or container. This explicitly
  satisfies the spec requirement: *"must actually run in the cloud."*
- Co-located with the frontend in one repository means one deploy command
  covers the entire stack.
- Free tier: 100 GB-hours/month — more than enough for this use case.
- Node.js 20 runtime supports all required libraries (PapaParse, Day.js,
  Drizzle ORM, Neon HTTP driver) without any polyfill gymnastics.

**Alternatives considered:**
- **AWS Lambda + API Gateway:** Works, but introduces IAM config, API Gateway
  setup, and a second deployment target — significant overhead for no gain.
- **Cloudflare Workers:** Edge runtime is excellent, but the Worker's lack of
  Node.js built-ins (no `Buffer`, limited stream APIs) would complicate CSV
  parsing. The free tier is generous but the DX friction isn't worth it here.
- **GCP Cloud Functions:** Requires a GCP project setup, service accounts,
  and billing enablement (even for free tier). More friction.

---

## 3. Database — Neon Serverless Postgres

**Decision:** Use [Neon](https://neon.tech) as the Postgres database.

**Why:**
- **Real SQL:** The stats queries require `PERCENTILE_CONT`, `GROUP BY`,
  `FILTER (WHERE ...)`, and window functions. These are native SQL features.
  A NoSQL store (Firestore, DynamoDB) would force all of this into
  application code, making aggregations fragile and slow.
- **Serverless-native:** Neon's `neon-http` driver works in Vercel's
  serverless environment without persistent connections or connection pool
  management. Standard `pg` or Prisma's connection pooling would require
  PgBouncer or Supabase's pooler — extra config overhead.
- **Free tier:** 0.5 GB storage, unlimited API calls — sufficient for all
  provided datasets combined (~44 000 rows × ~200 bytes ≈ 8 MB).
- **Zero cold-start penalty for the DB:** Neon autoscales to zero and wakes
  quickly. The `neon-http` driver uses HTTP/2, which is friendly to the
  ephemeral lifecycle of serverless functions.

**Alternatives considered:**
- **Supabase:** Also excellent, but the free tier pauses projects after 1
  week of inactivity, which could break the live URL at review time.
- **PlanetScale (MySQL):** Vitess-based MySQL doesn't support `PERCENTILE_CONT`
  or standard Postgres window functions. We'd need app-layer percentile calc.
- **Turso (SQLite):** Great for read-heavy workloads; edge-compatible. But
  the HTTP API and limited aggregate functions would make the stats queries
  more complex, and replication lag between edge nodes is a concern.
- **Firestore / DynamoDB:** Document stores — see SQL argument above.

---

## 4. ORM — Drizzle ORM

**Decision:** Use Drizzle ORM for schema definition, migrations, and query
building.

**Why:**
- **Type-safe without magic:** Drizzle generates TypeScript types directly
  from the schema definition. No code generation step needed at dev time
  (unlike Prisma's `prisma generate`).
- **Works in serverless:** Drizzle has first-class support for the
  `neon-http` driver. Prisma's traditional engine requires a long-running
  binary, which doesn't work in serverless without `@prisma/adapter-neon`.
- **Thin layer:** Drizzle doesn't hide SQL — raw `sql` template literals are
  trivially composable with query builder expressions. For complex
  aggregations (percentiles, CTEs) we drop to raw SQL without fighting
  the ORM.
- **Migrations are plain SQL files** in `drizzle/migrations/` — readable,
  auditable, and portable.

**Alternatives considered:**
- **Prisma:** Excellent DX, but heavier, requires binary engine, and the
  serverless setup with Neon requires `@prisma/adapter-neon` (additional
  complexity, another package).
- **Raw `pg` / `postgres.js`:** Would work, but we'd lose type safety on
  query results. Drizzle gives us typed results with essentially zero overhead.
- **Kysely:** A valid alternative to Drizzle. Slightly more verbose for schema
  definition. Either would work; Drizzle was chosen for its cleaner migration
  story.

---

## 5. CSV Parsing — PapaParse

**Decision:** Use PapaParse to parse the uploaded CSV in the serverless
function.

**Why:**
- Battle-tested library (10M+ weekly downloads) with robust handling of edge
  cases: quoted fields with commas, inconsistent line endings, partial rows.
- `dynamicTyping: false` keeps all values as strings, which is what we want
  — we handle all type coercions ourselves in the cleaning pipeline to
  maintain explicit control over every transformation.
- Streaming mode is available for large files, avoiding loading the entire
  CSV into memory at once.

**Alternatives considered:**
- **`csv-parse` (Node.js streams):** Also solid. Chosen PapaParse over it
  because PapaParse's `complete` callback API fits our batch-processing
  pattern more naturally and it has better error recovery on malformed rows.
- **Manual `split('\n')`:** Brittle (quoted newlines, CRLF vs LF, BOM chars).
  Not a real alternative for production data.

---

## 6. Date/Time — Day.js

**Decision:** Use Day.js with the `utc` and `customParseFormat` plugins for
all timestamp normalisation.

**Why:**
- Two specific problems need solving: Unix epoch → UTC ISO, and ISO strings
  with timezone offsets → UTC ISO. Day.js handles both cleanly.
- Bundle size: 2 kB (core) + ~1 kB per plugin. Significant vs Luxon (~23 kB)
  or Moment (~67 kB, deprecated).
- The API is simple: `dayjs.unix(n).utc().toISOString()` and
  `dayjs(str).utc().toISOString()`.

**Alternatives considered:**
- **`date-fns`:** Function-based, great tree-shaking. But timezone handling
  requires `date-fns-tz` which adds complexity for what is ultimately a
  two-line fix per issue.
- **Native `Date`:** `new Date(1746938700 * 1000)` works for epoch, but
  timezone offset normalisation requires parsing the offset manually. Too
  error-prone for messy data.
- **Luxon:** More powerful, but heavier and the API is more verbose for our
  use case.

---

## 7. Charts — Recharts

**Decision:** Use Recharts for all data visualisations on the dashboard.

**Why:**
- React-native: components wrap SVG directly, no canvas, no ref gymnastics.
- `BarChart` and `ReferenceLine` cover everything we need (uptime bars with
  99.9% threshold line, custom tooltip).
- MIT licensed, well-maintained, tree-shakeable.

**Alternatives considered:**
- **Chart.js + react-chartjs-2:** Canvas-based, slightly harder to make
  accessible and responsive. More config boilerplate.
- **Nivo:** Beautiful, but larger bundle and more complex API for simple bar
  charts.
- **ECharts:** Powerful, but overkill for 5 services × 2 metrics.
- **Victory:** Similar to Recharts; either would work. Recharts has a larger
  community and more Stack Overflow answers.

---

## 8. Styling — Tailwind CSS

**Decision:** Use Tailwind CSS (v4) for all styling, with a small `globals.css`
for custom scrollbar rules that Tailwind's utility classes can't express.

**Why:**
- Utility-first CSS means no context switching between `.tsx` and `.css`
  files for a project of this scope.
- Tailwind v4 ships with PostCSS integration and `@tailwindcss/postcss` —
  already configured by `create-next-app`.
- Responsive design (mobile → desktop dashboard layout) is trivially achieved
  with Tailwind's responsive prefixes.

**Alternatives considered:**
- **CSS Modules:** More scoped, but more files to manage for what is
  essentially a single-screen app.
- **Styled-components / Emotion:** Runtime CSS-in-JS adds ~15 kB and can
  cause SSR hydration mismatches.

---

## 9. SLA Threshold — 99.9%

**Decision:** Use 99.9% as the SLA target (the "three nines" standard).

**Why:** The problem statement explicitly uses 99.9% as the example SLA
threshold in the Background section. This is also the industry-standard
baseline for cloud service SLAs (AWS, GCP, Azure all use 99.9% for many
managed services).

---

## 10. Deduplication Key — (service_id, timestamp_utc, agent)

**Decision:** The unique constraint for deduplication is the triplet
`(service_id, timestamp_utc, agent)`, not just `(service_id, timestamp_utc)`.

**Why:** The data contains multiple agents (`agent-1`, `agent-2`) reporting
the same service at the same timestamp. This is a legitimate multi-agent
setup for redundancy — both readings are valid and should be preserved.
Deduplicating on just `(service_id, timestamp_utc)` would silently drop one
agent's data.

True duplicates (the same agent reporting the same result twice) are handled
by `ON CONFLICT DO NOTHING`.

---

## 11. Latency NULL Policy

**Decision:** Store latency as `NULL` (not 0) when the value is missing or
invalid.

**Why:** A latency of 0 is technically meaningful (a sub-millisecond response
or a cached response). Using 0 as a sentinel for "unknown" would pollute
average and percentile calculations by pulling them toward 0. `NULL` is
correctly excluded by SQL aggregate functions (`AVG`, `PERCENTILE_CONT`)
by default.

---

## 12. Stats Chosen for the Dashboard

**Decision:** Surface the following stats, chosen from the perspective of an
on-call engineer or billing team member:

| Stat | Why it matters |
|------|---------------|
| Uptime % per service | Primary SLA metric; instant pass/fail read |
| SLA status (pass/breach) | Binary answer to the billing question |
| Total checks & error count | Context for the uptime number |
| Avg latency (ms) | Performance health; high avg = degraded even when "up" |
| P99 latency (ms) | Tail latency; catches outlier spikes invisible in avg |
| Incident windows | When did it go down? For how long? — the on-call question |
| First/last check dates | Data range awareness — what period does this cover? |
| Upload history | Data provenance — which files contributed to the current pool |

**Stats deliberately NOT included:**
- Per-region breakdown (all data is from `ap-south-1` — no value in showing it)
- Per-agent breakdown (agents are infrastructure, not a user-facing concern)
- Hourly trends (not requested; would add significant query complexity)

---

## 13. No Internal HTTP Fetch from Server Components

**Decision:** The dashboard Server Component calls `getStats()` as a direct
TypeScript function import, not via `fetch('https://.../api/stats')`.

**Why:** Discovered in deployment that Vercel serverless functions cannot
reliably make loopback HTTP requests to themselves during SSR. The initial
implementation used `fetch(\`https://\${VERCEL_URL}/api/stats\`)` and crashed
with `ERROR 512871464` on the live deployment.

**Solution:** The query logic was extracted into `src/lib/getStats.ts` — a
plain `async` function shared by both the Server Component (direct import)
and the `/api/stats` route handler (called from within the route). No
code duplication, no fragile loopback networking.

---

## 14. Incident Gap Threshold — 30 Minutes

**Decision:** Two consecutive non-2xx checks are part of the same incident
window if the time gap between them is ≤ 30 minutes.

**Why:** The check interval is 15 minutes. A gap of 30 minutes (2× the
check interval) means at most one missed check separates two error events.
A single missed check is more likely a monitoring blip (agent offline,
network timeout) than the end of an outage. Using 30 min prevents
artificially splitting one real incident into many tiny 1-error "incidents."

---

## 15. Lazy DB Connection — `getDb()` Factory

**Decision:** The Drizzle database client is created lazily inside a
`getDb()` function rather than at module load time.

**Why:** Next.js evaluates module-level code during the build step (when
collecting route metadata). If `DATABASE_URL` is not set in the build
environment (which it isn't, for security), a module-level `new neon(url)`
would throw at build time and break the CI/CD deploy.

By moving the connection inside `getDb()`, the error is deferred to
**request time** — only thrown when an actual API call is made in an
environment where `DATABASE_URL` is expected to be present.

---

## 16. Uptime Chart Y-axis Floor

**Decision:** The bar chart Y-axis is anchored at:
- **95%** when any service is below 99%
- **98%** when all services are above 99%

**Why:** An auto-zoomed Y-axis (e.g. 99.9998%–100%) makes all bars look
identical even when uptime varies from 97% to 99.2% — the differences become
invisible. Fixed floors at 95% and 98% ensure the bars show meaningful visual
differences while still keeping the SLA threshold line visible.

---

## 17. Incident List — Fixed-Height Scroll Container

**Decision:** When the incident list is expanded, it renders inside a
fixed-height (`max-h-72`, 288px) scrollable container rather than expanding
in-place.

**Why:** With 278 incidents across all uploaded files, expanding in-place
caused the column to grow far beyond the paired latency table, creating a
very poor layout where one side of the two-column grid was hundreds of pixels
taller than the other. A scroll container keeps the layout bounded regardless
of incident count, and the content remains fully accessible via scroll.

---

## 18. Free-Tier Compliance

| Service | Free tier | Usage |
|---------|-----------|-------|
| Vercel Hobby | 100 GB-hours/month, 100K fn invocations/day | Well within limits |
| Neon | 0.5 GB storage, unlimited API | ~8 MB for all datasets |
| GitHub | Unlimited public repos | Source hosting |

No credit card required for any of the above.
