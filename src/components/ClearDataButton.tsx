"use client";

/**
 * ClearDataButton.tsx
 *
 * A button that calls DELETE /api/clear-data after a two-step confirmation.
 * Step 1: click → shows an inline confirmation prompt.
 * Step 2: confirm → calls the API, then reloads the page.
 *
 * Destructive action styling (red) with a clear escape hatch (Cancel).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

type State = "idle" | "confirming" | "clearing" | "done";

export default function ClearDataButton() {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleClear = async () => {
    setState("clearing");
    setError(null);
    try {
      const res = await fetch("/api/clear-data", { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setState("done");
      // Refresh the page — dashboard will show the empty state
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear data");
      setState("idle");
    }
  };

  // ── Idle: show the "Clear data" trigger button ────────────────────────────
  if (state === "idle") {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={() => setState("confirming")}
          className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
            />
          </svg>
          Clear all data
        </button>
        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}
      </div>
    );
  }

  // ── Confirming: inline confirmation prompt ────────────────────────────────
  if (state === "confirming") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
        <svg
          className="h-4 w-4 shrink-0 text-red-500"
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
        <p className="text-xs font-medium text-red-700 flex-1">
          Delete all rows? This cannot be undone.
        </p>
        <button
          onClick={handleClear}
          className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
        >
          Yes, clear
        </button>
        <button
          onClick={() => setState("idle")}
          className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  // ── Clearing: spinner ─────────────────────────────────────────────────────
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-500">
      <svg
        className="h-3.5 w-3.5 animate-spin text-zinc-400"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      Clearing…
    </div>
  );
}
