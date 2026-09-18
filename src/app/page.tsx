/**
 * app/page.tsx — Upload page (/)
 *
 * Server Component shell. The actual interactive upload logic lives in the
 * UploadForm client component. This page provides the layout, heading, and
 * the info sidebar.
 */

import NavBar from "@/components/NavBar";
import UploadForm from "@/components/UploadForm";

export default function UploadPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <NavBar activePage="upload" />

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-5">
          {/* Left column — heading + upload form */}
          <div className="lg:col-span-3 flex flex-col gap-8">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
                Upload monitoring data
              </h1>
              <p className="mt-2 text-sm text-zinc-500 leading-relaxed max-w-md">
                Upload a CSV of health-check logs. The pipeline will parse,
                clean, and persist the data so you can explore SLA metrics on
                the dashboard.
              </p>
            </div>

            <UploadForm />
          </div>

          {/* Right column — info sidebar */}
          <aside className="lg:col-span-2 flex flex-col gap-6">
            {/* Expected format card */}
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-3">
                Expected CSV format
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-100">
                      <th className="pb-2 pr-4 text-left font-semibold text-zinc-600">
                        Column
                      </th>
                      <th className="pb-2 text-left font-semibold text-zinc-600">
                        Example
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-zinc-500">
                    {[
                      ["service_id", "svc-auth"],
                      ["service_name", "auth-api"],
                      ["timestamp", "2025-05-13T12:00:00Z"],
                      ["status_code", "200"],
                      ["latency", "177"],
                      ["latency_unit", "ms / s"],
                      ["agent", "agent-1"],
                      ["region", "ap-south-1"],
                    ].map(([col, ex]) => (
                      <tr key={col} className="border-b border-zinc-50 last:border-0">
                        <td className="py-1.5 pr-4 font-mono">{col}</td>
                        <td className="py-1.5 text-zinc-400">{ex}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Data cleaning card */}
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-3">
                What gets cleaned automatically
              </h2>
              <ul className="flex flex-col gap-2">
                {[
                  ["Unix epoch timestamps", "Converted to UTC ISO"],
                  ["Timezone offsets", "Normalised to UTC"],
                  ["Latency in seconds", "Converted to ms"],
                  ["Missing latency", "Stored as null, flagged"],
                  ["Negative latency", "Stored as null, flagged"],
                  ["Invalid status codes", "Kept + flagged"],
                  ["Duplicate rows", "Skipped on conflict"],
                ].map(([issue, fix]) => (
                  <li key={issue} className="flex items-start gap-2 text-xs">
                    <svg
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m4.5 12.75 6 6 9-13.5"
                      />
                    </svg>
                    <span>
                      <span className="font-medium text-zinc-700">{issue}</span>
                      <span className="text-zinc-400"> — {fix}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* SLA info card */}
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-5">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-amber-600 mb-2">
                SLA target
              </h2>
              <p className="text-2xl font-bold text-amber-700 tabular-nums">
                99.9%
              </p>
              <p className="mt-1 text-xs text-amber-600 leading-relaxed">
                Uptime is calculated as successful 2xx checks ÷ total checks.
                Any service below 99.9% is marked as an SLA breach.
              </p>
            </div>
          </aside>
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
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
