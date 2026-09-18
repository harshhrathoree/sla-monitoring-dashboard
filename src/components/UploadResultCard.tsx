"use client";

/**
 * UploadResultCard.tsx
 *
 * Shown after /api/upload returns. Displays the upload summary and a link
 * to the dashboard. Also handles the error state (API returned an error).
 */

import Link from "next/link";

export interface UploadSummary {
  batchId: string;
  filename: string;
  rowsProcessed: number;
  rowsInserted: number;
  rowsFlagged: number;
  rowsSkipped: number;
  durationMs: number;
}

interface UploadResultCardProps {
  summary: UploadSummary;
  onUploadAnother: () => void;
}

function StatCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: "green" | "yellow" | "zinc";
}) {
  const colours = {
    green: "text-emerald-600",
    yellow: "text-amber-600",
    zinc: "text-zinc-700",
  };
  const colour = colours[highlight ?? "zinc"];

  return (
    <div className="flex flex-col items-center gap-0.5 px-4 py-3 bg-zinc-50 rounded-lg border border-zinc-200">
      <span className={`text-2xl font-bold tabular-nums ${colour}`}>
        {value.toLocaleString()}
      </span>
      <span className="text-xs text-zinc-500 text-center leading-tight">{label}</span>
    </div>
  );
}

export default function UploadResultCard({
  summary,
  onUploadAnother,
}: UploadResultCardProps) {
  const { filename, rowsProcessed, rowsInserted, rowsFlagged, rowsSkipped, durationMs } =
    summary;

  return (
    <div className="w-full rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 bg-emerald-50 border-b border-emerald-100">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
          <svg
            className="h-4 w-4 text-emerald-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-800">Upload complete</p>
          <p className="text-xs text-emerald-600 truncate" title={filename}>
            {filename} &middot; {(durationMs / 1000).toFixed(2)}s
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 p-6 sm:grid-cols-4">
        <StatCell label="Rows processed" value={rowsProcessed} highlight="zinc" />
        <StatCell label="Rows inserted" value={rowsInserted} highlight="green" />
        <StatCell
          label="Rows flagged"
          value={rowsFlagged}
          highlight={rowsFlagged > 0 ? "yellow" : "zinc"}
        />
        <StatCell label="Rows skipped" value={rowsSkipped} highlight="zinc" />
      </div>

      {/* Data quality note */}
      {rowsFlagged > 0 && (
        <div className="mx-6 mb-4 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
          <svg
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
          <p className="text-xs text-amber-700 leading-relaxed">
            <span className="font-semibold">{rowsFlagged.toLocaleString()} rows</span> had
            data quality issues (e.g. null latency, epoch timestamps, invalid status codes).
            They were inserted and flagged — you can filter them in the dashboard.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 px-6 pb-6 sm:flex-row">
        <Link
          href="/dashboard"
          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors"
        >
          View Dashboard
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </Link>
        <button
          onClick={onUploadAnother}
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          Upload another file
        </button>
      </div>
    </div>
  );
}
