"use client";

/**
 * IncidentList.tsx — Shows all incident windows across all services,
 * sorted most recent first. Each incident shows service, start→end, duration.
 */

import type { ServiceStats } from "@/types/api";

interface IncidentListProps {
  services: ServiceStats[];
}

interface FlatIncident {
  serviceId: string;
  serviceName: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  errorCount: number;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

export default function IncidentList({ services }: IncidentListProps) {
  // Flatten and sort all incidents newest first
  const flat: FlatIncident[] = services
    .flatMap((s) =>
      s.incidents.map((inc) => ({
        serviceId: s.serviceId,
        serviceName: s.serviceName,
        ...inc,
      }))
    )
    .sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );

  if (flat.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <svg
          className="h-8 w-8 text-emerald-300"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
        <p className="text-sm text-zinc-400">No incidents detected</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-zinc-100">
      {flat.map((inc, idx) => (
        <div key={idx} className="flex items-start gap-4 py-3 first:pt-0 last:pb-0">
          {/* Left: duration badge */}
          <div className="shrink-0 flex flex-col items-center gap-0.5 w-14">
            <span className="text-sm font-bold text-red-600 tabular-nums">
              {formatDuration(inc.durationMinutes)}
            </span>
            <span className="text-xs text-zinc-400">{inc.errorCount} errors</span>
          </div>

          {/* Right: service + time range */}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-zinc-700">
              {inc.serviceName}
              <span className="ml-1.5 font-normal font-mono text-zinc-400 text-xs">
                {inc.serviceId}
              </span>
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {formatDateTime(inc.startTime)}
              <span className="mx-1.5 text-zinc-300">→</span>
              {formatDateTime(inc.endTime)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
