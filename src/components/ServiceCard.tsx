"use client";

/**
 * ServiceCard.tsx — Per-service SLA status card.
 * Shows: service name, uptime %, SLA status badge, error count, avg latency.
 */

import type { ServiceStats } from "@/types/api";
import { SLA_TARGET } from "@/types/api";

interface ServiceCardProps {
  service: ServiceStats;
}

export default function ServiceCard({ service }: ServiceCardProps) {
  const {
    serviceName,
    serviceId,
    uptimePct,
    slaBreached,
    totalChecks,
    errorCount,
    avgLatencyMs,
    firstCheck,
    lastCheck,
  } = service;

  const dateRange = `${new Date(firstCheck).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  })} – ${new Date(lastCheck).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

  return (
    <div
      className={`rounded-xl border bg-white p-5 flex flex-col gap-4 ${
        slaBreached
          ? "border-red-200 shadow-sm shadow-red-50"
          : "border-zinc-200"
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-mono text-zinc-400 truncate">{serviceId}</p>
          <p className="text-sm font-semibold text-zinc-900 truncate">{serviceName}</p>
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            slaBreached
              ? "bg-red-100 text-red-700"
              : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {slaBreached ? (
            <>
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
              Breach
            </>
          ) : (
            <>
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              SLA Met
            </>
          )}
        </span>
      </div>

      {/* Big uptime number */}
      <div>
        <p
          className={`text-3xl font-bold tabular-nums ${
            slaBreached ? "text-red-600" : "text-emerald-600"
          }`}
        >
          {uptimePct.toFixed(3)}%
        </p>
        <p className="text-xs text-zinc-400 mt-0.5">
          target {SLA_TARGET}%
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 border-t border-zinc-100 pt-3">
        <div>
          <p className="text-xs text-zinc-400">Total checks</p>
          <p className="text-sm font-semibold text-zinc-700 tabular-nums">
            {totalChecks.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-400">Errors</p>
          <p className={`text-sm font-semibold tabular-nums ${errorCount > 0 ? "text-red-600" : "text-zinc-700"}`}>
            {errorCount.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-400">Avg latency</p>
          <p className="text-sm font-semibold text-zinc-700 tabular-nums">
            {avgLatencyMs != null ? `${Math.round(avgLatencyMs)} ms` : "—"}
          </p>
        </div>
      </div>

      {/* Date range */}
      <p className="text-xs text-zinc-400">{dateRange}</p>
    </div>
  );
}
