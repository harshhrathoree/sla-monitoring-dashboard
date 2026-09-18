"use client";

/**
 * UploadProgress.tsx
 *
 * Indeterminate progress bar + status label shown while the upload
 * request is in-flight. The bar animates end-to-end to communicate
 * activity without needing to know actual upload progress.
 */

export default function UploadProgress({ filename }: { filename: string }) {
  return (
    <div className="w-full rounded-xl border border-zinc-200 bg-white px-8 py-10 flex flex-col items-center gap-5 shadow-sm">
      {/* Spinner */}
      <svg
        className="h-10 w-10 animate-spin text-blue-500"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>

      {/* Label */}
      <div className="text-center">
        <p className="text-sm font-semibold text-zinc-700">Processing upload…</p>
        <p className="mt-0.5 text-xs text-zinc-500 max-w-xs truncate" title={filename}>
          {filename}
        </p>
      </div>

      {/* Indeterminate progress bar */}
      <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
        <div
          className="h-full w-1/3 bg-blue-500 rounded-full animate-[progress_1.4s_ease-in-out_infinite]"
          style={{
            animation: "progress 1.4s ease-in-out infinite",
          }}
        />
      </div>

      <p className="text-xs text-zinc-400">
        Cleaning data and writing to database…
      </p>

      <style>{`
        @keyframes progress {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}
