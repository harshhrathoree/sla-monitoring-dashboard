"use client";

/**
 * UptimeChart.tsx — Horizontal bar chart showing uptime % per service.
 * Draws a vertical reference line at the 99.9% SLA threshold.
 * Uses Recharts BarChart.
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { ServiceStats } from "@/types/api";
import { SLA_TARGET } from "@/types/api";

interface UptimeChartProps {
  services: ServiceStats[];
}

interface ChartDataPoint {
  name: string;
  uptime: number;
  breached: boolean;
}

// Custom tooltip
function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: ChartDataPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-md text-xs">
      <p className="font-semibold text-zinc-800">{d.payload.name}</p>
      <p className={`mt-0.5 font-mono ${d.payload.breached ? "text-red-600" : "text-emerald-600"}`}>
        {d.value.toFixed(4)}% uptime
      </p>
      <p className="text-zinc-400 mt-0.5">SLA target: {SLA_TARGET}%</p>
    </div>
  );
}

export default function UptimeChart({ services }: UptimeChartProps) {
  const data: ChartDataPoint[] = services.map((s) => ({
    name: s.serviceName,
    uptime: s.uptimePct,
    breached: s.slaBreached,
  }));

  // Y-axis domain: anchor at a meaningful floor so bars show real differences.
  // If any service is below 99%, drop to 95% floor so the breach is visible.
  // If all services are above 99%, use 98% floor — avoids the "all bars equal"
  // problem caused by zooming in to e.g. 99.9998%–100%.
  const minUptime = Math.min(...data.map((d) => d.uptime));
  const yMin = minUptime < 99 ? 95 : 98;
  const yMax = 100;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
        barCategoryGap="30%"
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "#71717a" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[yMin, yMax]}
          tickFormatter={(v: number) => `${v}%`}
          tick={{ fontSize: 11, fill: "#71717a" }}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f4f4f5" }} />
        {/* SLA threshold line */}
        <ReferenceLine
          y={SLA_TARGET}
          stroke="#f59e0b"
          strokeDasharray="4 3"
          strokeWidth={1.5}
          label={{
            value: "SLA 99.9%",
            position: "insideTopRight",
            fontSize: 10,
            fill: "#d97706",
            dy: -4,
          }}
        />
        <Bar dataKey="uptime" radius={[4, 4, 0, 0]} maxBarSize={56}>
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.breached ? "#fca5a5" : "#6ee7b7"}
              stroke={entry.breached ? "#ef4444" : "#10b981"}
              strokeWidth={1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
