/**
 * app/dashboard/page.tsx — Dashboard page (/dashboard)
 *
 * Server Component: fetches /api/stats at render time (SSR).
 * - No client-side data loading needed for the initial stats view.
 * - StatsSection receives data as props.
 * - LogsSection is a fully client-side component (manages its own fetch/filter state).
 */

import Link from "next/link";
import NavBar from "@/components/NavBar";
import StatsSection from "@/components/StatsSection";
import LogsSection from "@/components/LogsSection";
import type { StatsResponse } from "@/types/api";

// Always re-render on request (data changes with each upload)
export const dynamic = "force-dynamic";

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchStats(): Promise<StatsResponse | null> {
  try {
    // In Server Components we call the API route by absolute URL.
    // VERCEL_URL is set automatically on Vercel; fall back to localhost for dev.
    const base =
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";

    const res = await fetch(`${base}/api/stats`, {
      cache: "no-store", // always fresh
    });

    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100">
        <svg
          className="h-8 w-8 text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
          />
        </svg>
      </div>
      <div className="text-center max-w-sm">
        <h2 className="text-lg font-semibold text-zinc-800">No data yet</h2>
        <p className="mt-1 text-sm text-zinc-500 leading-relaxed">
          Upload a health-check CSV to see SLA stats and logs here.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors"
      >
        Upload a CSV
      </Link>
    </div>
  );
}

// ─── Error state ──────────────────────────────────────────────────────────────

function ErrorState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
        <svg
          className="h-8 w-8 text-red-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold text-zinc-800">Could not load stats</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Check that the DATABASE_URL is configured and the schema has been pushed.
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const stats = await fetchStats();

  const serviceIds = stats?.services.map((s) => s.serviceId) ?? [];
  const hasData = stats !== null && stats.services.length > 0;
  const fetchFailed = stats === null;

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <NavBar activePage="dashboard" />

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        {/* Page heading */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
              Dashboard
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              SLA metrics and health-check logs across all uploaded datasets.
            </p>
          </div>
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Upload CSV
          </Link>
        </div>

        {/* Body */}
        {fetchFailed ? (
          <ErrorState />
        ) : !hasData ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-6">
            {/* Stats section (SSR data passed as props) */}
            <StatsSection data={stats} />

            {/* Logs section (client-side fetch + filter state) */}
            <LogsSection serviceIds={serviceIds} />
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-200 bg-white py-4">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="text-xs text-zinc-400 text-center">
            SLA Monitoring Dashboard &middot; Full Stack Case Study
          </p>
        </div>
      </footer>
    </div>
  );
}
