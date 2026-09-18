"use client";

/**
 * LatencyTable.tsx — Avg + P99 latency per service in a compact table.
 */

import type { ServiceStats } from "@/types/api";

interface LatencyTableProps {
  services: ServiceStats[];
}

function LatencyBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-400 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-zinc-700 w-16 text-right">
        {Math.round(value)} ms
      </span>
    </div>
  );
}

export default function LatencyTable({ services }: LatencyTableProps) {
  const maxAvg = Math.max(...services.map((s) => s.avgLatencyMs ?? 0));
  const maxP99 = Math.max(...services.map((s) => s.p99LatencyMs ?? 0));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-100">
            <th className="pb-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide">
              Service
            </th>
            <th className="pb-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide w-44">
              Avg latency
            </th>
            <th className="pb-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide w-44">
              P99 latency
            </th>
            <th className="pb-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">
              Days
            </th>
          </tr>
        </thead>
        <tbody>
          {services.map((s) => (
            <tr key={s.serviceId} className="border-b border-zinc-50 last:border-0">
              <td className="py-3 pr-4">
                <p className="font-medium text-zinc-800 text-xs">{s.serviceName}</p>
                <p className="font-mono text-zinc-400 text-xs">{s.serviceId}</p>
              </td>
              <td className="py-3 pr-6">
                {s.avgLatencyMs != null ? (
                  <LatencyBar value={s.avgLatencyMs} max={maxAvg} />
                ) : (
                  <span className="text-xs text-zinc-300">No data</span>
                )}
              </td>
              <td className="py-3 pr-4">
                {s.p99LatencyMs != null ? (
                  <LatencyBar value={s.p99LatencyMs} max={maxP99} />
                ) : (
                  <span className="text-xs text-zinc-300">No data</span>
                )}
              </td>
              <td className="py-3 text-right text-xs tabular-nums text-zinc-500">
                {s.daysCovered}d
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
