"use client";

/**
 * IncidentList.tsx — Shows incident windows across all services.
 * Capped at INITIAL_VISIBLE items with an expand/collapse toggle.
 * Sorted most-recent first. Longest incidents (most errors) appear first
 * when duration is equal.
 */

import { useState } from "react";
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

const INITIAL_VISIBLE = 5;

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

function IncidentRow({ inc }: { inc: FlatIncident }) {
  return (
    <div className="flex items-start gap-4 py-2.5 first:pt-0 last:pb-0">
      {/* Duration badge */}
      <div className="shrink-0 flex flex-col items-center gap-0.5 w-12 text-center">
        <span className="text-sm font-bold text-red-600 tabular-nums leading-tight">
          {formatDuration(inc.durationMinutes)}
        </span>
        <span className="text-xs text-zinc-400 leading-tight">
          {inc.errorCount} err{inc.errorCount !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Service + time range */}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-zinc-700 leading-tight">
          {inc.serviceName}
          <span className="ml-1.5 font-normal font-mono text-zinc-400">
            {inc.serviceId}
          </span>
        </p>
        <p className="text-xs text-zinc-500 mt-0.5 leading-tight">
          {formatDateTime(inc.startTime)}
          <span className="mx-1 text-zinc-300">→</span>
          {formatDateTime(inc.endTime)}
        </p>
      </div>
    </div>
  );
}

export default function IncidentList({ services }: IncidentListProps) {
  const [expanded, setExpanded] = useState(false);

  // Flatten + sort: most recent first, then by error count descending
  const flat: FlatIncident[] = services
    .flatMap((s) =>
      s.incidents.map((inc) => ({
        serviceId: s.serviceId,
        serviceName: s.serviceName,
        ...inc,
      }))
    )
    .sort((a, b) => {
      const timeDiff =
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
      return timeDiff !== 0 ? timeDiff : b.errorCount - a.errorCount;
    });

  if (flat.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2">
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

  const visible = expanded ? flat : flat.slice(0, INITIAL_VISIBLE);
  const hiddenCount = flat.length - INITIAL_VISIBLE;

  return (
    <div className="flex flex-col">
      {/* Scrollable incident rows */}
      <div className="flex flex-col divide-y divide-zinc-100">
        {visible.map((inc, idx) => (
          <IncidentRow key={idx} inc={inc} />
        ))}
      </div>

      {/* Expand / collapse toggle */}
      {flat.length > INITIAL_VISIBLE && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 transition-colors w-full"
        >
          {expanded ? (
            <>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
              </svg>
              Show less
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
              Show {hiddenCount} more incident{hiddenCount !== 1 ? "s" : ""}
            </>
          )}
        </button>
      )}
    </div>
  );
}
