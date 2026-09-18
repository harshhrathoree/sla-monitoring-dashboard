"use client";

/**
 * LogsSection.tsx
 *
 * Filterable, paginated log table. Manages its own filter + page state and
 * re-fetches /api/logs whenever any filter changes.
 *
 * Filters:
 *  - service (dropdown)
 *  - from date (date input)
 *  - to date (date input)
 *  - status: all | ok | error | flagged
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { LogRow, LogsResponse } from "@/types/api";

interface LogsSectionProps {
  /** List of unique service IDs for the filter dropdown */
  serviceIds: string[];
}

interface Filters {
  service: string;
  from: string;
  to: string;
  status: string;
}

const LIMIT = 50;

// ─── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ code }: { code: number }) {
  const is2xx = code >= 200 && code < 300;
  const is5xx = code >= 500;
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-mono font-semibold ${
        is2xx
          ? "bg-emerald-50 text-emerald-700"
          : is5xx
          ? "bg-red-50 text-red-700"
          : "bg-amber-50 text-amber-700"
      }`}
    >
      {code}
    </span>
  );
}

// ─── Quality flags ────────────────────────────────────────────────────────────

const FLAG_LABELS: Record<string, string> = {
  epoch_timestamp: "epoch ts",
  tz_normalised: "tz fix",
  unit_normalised: "unit fix",
  null_latency: "null latency",
  negative_latency: "neg latency",
  invalid_status: "bad status",
};

function FlagBadges({ flags }: { flags: string }) {
  if (!flags) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.split(",").map((f) => (
        <span
          key={f}
          className="inline-block rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-xs text-amber-700"
          title={f}
        >
          {FLAG_LABELS[f] ?? f}
        </span>
      ))}
    </div>
  );
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 bg-zinc-100 rounded w-full" />
        </td>
      ))}
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LogsSection({ serviceIds }: LogsSectionProps) {
  const [filters, setFilters] = useState<Filters>({
    service: "",
    from: "",
    to: "",
    status: "",
  });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use a ref to track if a fetch is in-flight to avoid race conditions
  const fetchIdRef = useRef(0);

  const fetchLogs = useCallback(async (f: Filters, p: number) => {
    const id = ++fetchIdRef.current;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (f.service) params.set("service", f.service);
    if (f.from) params.set("from", f.from);
    if (f.to) params.set("to", f.to);
    if (f.status) params.set("status", f.status);
    params.set("page", String(p));
    params.set("limit", String(LIMIT));

    try {
      const res = await fetch(`/api/logs?${params.toString()}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const json: LogsResponse = await res.json();
      // Only apply if this is still the latest fetch
      if (id === fetchIdRef.current) {
        setData(json);
      }
    } catch (err) {
      if (id === fetchIdRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load logs");
      }
    } finally {
      if (id === fetchIdRef.current) setLoading(false);
    }
  }, []);

  // Fetch whenever filters or page changes
  useEffect(() => {
    fetchLogs(filters, page);
  }, [filters, page, fetchLogs]);

  // Reset to page 1 when filters change
  const updateFilter = (key: keyof Filters, value: string) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setPage(1);
    setFilters({ service: "", from: "", to: "", status: "" });
  };

  const hasActiveFilters =
    filters.service || filters.from || filters.to || filters.status;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      {/* Section header */}
      <div className="px-6 py-4 border-b border-zinc-100">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-900">
            Health Check Logs
            {data && (
              <span className="ml-2 text-xs font-normal text-zinc-400 tabular-nums">
                {data.totalCount.toLocaleString()} rows
              </span>
            )}
          </h2>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-zinc-500 hover:text-zinc-800 underline underline-offset-2"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Filters row */}
        <div className="mt-3 flex flex-wrap gap-2">
          {/* Service filter */}
          <select
            value={filters.service}
            onChange={(e) => updateFilter("service", e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Filter by service"
          >
            <option value="">All services</option>
            {serviceIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>

          {/* From date */}
          <input
            type="date"
            value={filters.from}
            onChange={(e) => updateFilter("from", e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="From date"
          />

          {/* To date */}
          <input
            type="date"
            value={filters.to}
            onChange={(e) => updateFilter("to", e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="To date"
          />

          {/* Status filter */}
          <select
            value={filters.status}
            onChange={(e) => updateFilter("status", e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="ok">2xx OK</option>
            <option value="error">Errors (non-2xx)</option>
            <option value="flagged">Flagged (data quality)</option>
          </select>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="px-6 py-4 text-sm text-red-600 bg-red-50 border-b border-red-100">
          Failed to load logs: {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50">
              {[
                "Timestamp (UTC)",
                "Service",
                "Status",
                "Latency",
                "Agent",
                "Region",
                "Flags",
              ].map((col) => (
                <th
                  key={col}
                  className="px-4 py-2.5 text-left font-semibold text-zinc-500 uppercase tracking-wide text-xs whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)
              : data?.rows.map((row: LogRow) => (
                  <tr
                    key={row.id}
                    className={`border-b border-zinc-50 hover:bg-zinc-50/60 transition-colors ${
                      row.dataQualityFlags ? "bg-amber-50/30" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 font-mono text-zinc-500 whitespace-nowrap">
                      {new Date(row.timestampUtc).toISOString().replace("T", " ").replace(".000Z", " Z")}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <p className="text-zinc-800 font-medium">{row.serviceName}</p>
                      <p className="font-mono text-zinc-400">{row.serviceId}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge code={row.statusCode} />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-zinc-600 tabular-nums whitespace-nowrap">
                      {row.latencyMs != null ? `${Math.round(row.latencyMs)} ms` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500">{row.agent}</td>
                    <td className="px-4 py-2.5 text-zinc-500">{row.region}</td>
                    <td className="px-4 py-2.5">
                      <FlagBadges flags={row.dataQualityFlags} />
                    </td>
                  </tr>
                ))}

            {/* Empty state */}
            {!loading && data?.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-zinc-400 text-sm">
                  No logs found for the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-100 bg-zinc-50">
          <p className="text-xs text-zinc-500">
            Page {data.page} of {data.totalPages} &middot;{" "}
            {data.totalCount.toLocaleString()} total rows
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={data.page <= 1 || loading}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            {/* Page number pills — show window around current page */}
            {Array.from({ length: Math.min(5, data.totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(data.page - 2, data.totalPages - 4));
              const p = start + i;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  disabled={loading}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    p === data.page
                      ? "bg-zinc-900 border-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                  } disabled:cursor-not-allowed`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={data.page >= data.totalPages || loading}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
