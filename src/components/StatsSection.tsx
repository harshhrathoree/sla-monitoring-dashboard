"use client";

/**
 * StatsSection.tsx
 *
 * Collapsible stats panel. Sections:
 *  1. Service SLA cards (grid)
 *  2. Uptime bar chart
 *  3. Latency table
 *  4. Incident list
 *
 * The collapse/expand state is local to this component. The section is
 * expanded by default.
 */

import { useState } from "react";
import type { StatsResponse } from "@/types/api";
import ServiceCard from "./ServiceCard";
import UptimeChart from "./UptimeChart";
import LatencyTable from "./LatencyTable";
import IncidentList from "./IncidentList";

interface StatsSectionProps {
  data: StatsResponse;
}

function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-4">
      {title}
    </h2>
  );
}

export default function StatsSection({ data }: StatsSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { services, overallUptimePct, lastUploadAt, totalRows } = data;

  const totalIncidents = services.reduce((sum, s) => sum + s.incidents.length, 0);
  const breachedCount = services.filter((s) => s.slaBreached).length;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      {/* ── Section header (always visible) ──────────────────────────────── */}
      <div
        className="flex items-center justify-between px-6 py-4 cursor-pointer select-none hover:bg-zinc-50 transition-colors"
        onClick={() => setCollapsed((c) => !c)}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setCollapsed((c) => !c);
        }}
      >
        {/* Left: summary pills */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-zinc-900">SLA Statistics</span>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
            <span className="font-mono font-bold">{overallUptimePct.toFixed(3)}%</span>
            overall uptime
          </span>

          {breachedCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              {breachedCount} breach{breachedCount > 1 ? "es" : ""}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              All services passing
            </span>
          )}

          <span className="text-xs text-zinc-400 tabular-nums">
            {totalRows.toLocaleString()} rows
          </span>

          {lastUploadAt && (
            <span className="text-xs text-zinc-400">
              last upload{" "}
              {new Date(lastUploadAt).toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "UTC",
                timeZoneName: "short",
              })}
            </span>
          )}
        </div>

        {/* Right: chevron */}
        <svg
          className={`h-4 w-4 text-zinc-400 shrink-0 transition-transform duration-200 ${
            collapsed ? "-rotate-90" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </div>

      {/* ── Collapsible body ──────────────────────────────────────────────── */}
      {!collapsed && (
        <div className="border-t border-zinc-100 px-6 py-6 flex flex-col gap-8">

          {/* 1. Service SLA cards */}
          <div>
            <SectionHeading title={`Service SLA Status (${services.length} services)`} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
              {services.map((s) => (
                <ServiceCard key={s.serviceId} service={s} />
              ))}
            </div>
          </div>

          {/* 2. Uptime bar chart */}
          <div>
            <SectionHeading title="Uptime % per Service" />
            <UptimeChart services={services} />
          </div>

          {/* 3. Latency table + Incidents — two columns on wide screens */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div>
              <SectionHeading title="Response Latency" />
              <LatencyTable services={services} />
            </div>
            <div>
              <SectionHeading
                title={`Incident Windows${totalIncidents > 0 ? ` (${totalIncidents})` : ""}`}
              />
              <IncidentList services={services} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
