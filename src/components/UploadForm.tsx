"use client";

/**
 * UploadForm.tsx
 *
 * Client component that owns the full upload flow state machine:
 *
 *   idle  →  uploading  →  success
 *                       ↓
 *                      error
 *
 * - idle:      shows DropZone + selected file preview + Upload button
 * - uploading: shows UploadProgress
 * - success:   shows UploadResultCard
 * - error:     shows error banner, resets to idle on dismiss
 */

import { useState, useCallback } from "react";
import DropZone from "./DropZone";
import UploadProgress from "./UploadProgress";
import UploadResultCard, { type UploadSummary } from "./UploadResultCard";

type State =
  | { status: "idle" }
  | { status: "file_selected"; file: File }
  | { status: "uploading"; filename: string }
  | { status: "success"; summary: UploadSummary }
  | { status: "error"; message: string; filename?: string };

// Format bytes to a human-readable size string
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Quick client-side row estimate (count newlines, subtract 1 for header)
function estimateRows(file: File): string {
  // We can't synchronously read the file here easily, so just show file size
  // as the pre-upload indicator. Actual count comes back from the server.
  return formatBytes(file.size);
}

export default function UploadForm() {
  const [state, setState] = useState<State>({ status: "idle" });

  const handleFile = useCallback((file: File) => {
    setState({ status: "file_selected", file });
  }, []);

  const handleUpload = useCallback(async (file: File) => {
    setState({ status: "uploading", filename: file.name });

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        setState({
          status: "error",
          message: json.error ?? `Server error: HTTP ${res.status}`,
          filename: file.name,
        });
        return;
      }

      setState({ status: "success", summary: json as UploadSummary });
    } catch (err) {
      setState({
        status: "error",
        message:
          err instanceof Error
            ? err.message
            : "Network error — check your connection and try again.",
        filename: file.name,
      });
    }
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  // ── Render ────────────────────────────────────────────────────────────────

  if (state.status === "uploading") {
    return <UploadProgress filename={state.filename} />;
  }

  if (state.status === "success") {
    return <UploadResultCard summary={state.summary} onUploadAnother={reset} />;
  }

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Error banner */}
      {state.status === "error" && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <svg
            className="mt-0.5 h-4 w-4 shrink-0 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700">Upload failed</p>
            <p className="text-xs text-red-600 mt-0.5">{state.message}</p>
          </div>
          <button
            onClick={reset}
            className="shrink-0 text-red-400 hover:text-red-600 transition-colors"
            aria-label="Dismiss error"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Drop zone */}
      <DropZone
        onFile={handleFile}
        disabled={state.status === "file_selected"}
      />

      {/* Selected file preview + Upload button */}
      {state.status === "file_selected" && (
        <div className="flex flex-col gap-3">
          {/* File chip */}
          <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 border border-blue-100">
              <svg
                className="h-5 w-5 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-800 truncate">
                {state.file.name}
              </p>
              <p className="text-xs text-zinc-500">{estimateRows(state.file)}</p>
            </div>
            <button
              onClick={reset}
              className="shrink-0 text-zinc-400 hover:text-zinc-600 transition-colors"
              aria-label="Remove selected file"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Upload button */}
          <button
            onClick={() => handleUpload(state.file)}
            className="w-full rounded-lg bg-zinc-900 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-700 active:bg-zinc-800 transition-colors"
          >
            Upload &amp; Process
          </button>

          <p className="text-center text-xs text-zinc-400">
            Data will be cleaned and saved to the database
          </p>
        </div>
      )}

      {/* Idle state hint */}
      {state.status === "idle" && (
        <p className="text-center text-xs text-zinc-400">
          Supports multi-day health-check exports from all monitoring agents
        </p>
      )}
    </div>
  );
}
