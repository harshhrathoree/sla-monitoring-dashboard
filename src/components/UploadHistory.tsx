"use client";

/**
 * UploadHistory.tsx
 *
 * Fetches and displays the last N upload batches. Shown below the upload form
 * on the upload page. Each row shows filename, date, and row counts.
 * Refreshes automatically after each successful upload via the `refreshKey` prop.
 */

import { useEffect, useState } from "react";
import type { UploadHistoryItem } from "@/app/api/uploads/route";

interface UploadHistoryProps {
  /** Increment this to trigger a re-fetch after a new upload completes */
  refreshKey: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

function formatNum(n: number): string {
  return n.toLocaleString();
}

export default function UploadHistory({ refreshKey }: UploadHistoryProps) {
  const [items, setItems] = useState<UploadHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/uploads")
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json();
      })
      .then((data: UploadHistoryItem[]) => {
        setItems(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="h-4 w-32 bg-zinc-100 rounded animate-pulse mb-4" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 bg-zinc-50 rounded animate-pulse mb-2" />
        ))}
      </div>
    );
  }

  if (error || items.length === 0) {
    return null; // Don't show the section at all if no uploads yet
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-zinc-100 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Upload History
        </h2>
        <span className="text-xs text-zinc-400">{items.length} recent</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50">
              {["File", "Uploaded", "Processed", "Inserted", "Flagged", "Skipped"].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left font-semibold text-zinc-400 uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/60 transition-colors"
              >
                {/* Filename */}
                <td className="px-4 py-2.5 font-medium text-zinc-800 max-w-[200px]">
                  <span className="truncate block" title={item.filename}>
                    {item.filename}
                  </span>
                </td>

                {/* Date */}
                <td className="px-4 py-2.5 text-zinc-500 whitespace-nowrap">
                  {formatDate(item.uploadedAt)}
                </td>

                {/* Counts */}
                <td className="px-4 py-2.5 tabular-nums text-zinc-600">
                  {formatNum(item.rowsProcessed)}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-emerald-600 font-medium">
                  {formatNum(item.rowsInserted)}
                </td>
                <td className="px-4 py-2.5 tabular-nums">
                  <span
                    className={
                      item.rowsFlagged > 0 ? "text-amber-600 font-medium" : "text-zinc-400"
                    }
                  >
                    {formatNum(item.rowsFlagged)}
                  </span>
                </td>
                <td className="px-4 py-2.5 tabular-nums text-zinc-400">
                  {formatNum(item.rowsSkipped)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
