"use client";

/**
 * DropZone.tsx
 *
 * Drag-and-drop file picker that accepts .csv files only.
 * Handles both drag events and click-to-open file picker.
 * Calls onFile(file) when a valid CSV is selected.
 * Shows an error message when a non-CSV is dropped.
 */

import { useRef, useState, useCallback, DragEvent, ChangeEvent } from "react";

interface DropZoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export default function DropZone({ onFile, disabled = false }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setError("Only .csv files are accepted.");
        return;
      }
      onFile(file);
    },
    [onFile]
  );

  // ── Drag events ────────────────────────────────────────────────────────────
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // ── Input change ───────────────────────────────────────────────────────────
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so the same file can be re-selected if needed
    e.target.value = "";
  };

  const borderClass = isDragging
    ? "border-blue-500 bg-blue-50"
    : "border-zinc-300 bg-white hover:border-blue-400 hover:bg-blue-50/40";

  const disabledClass = disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer";

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Drop CSV file here or click to select"
        className={`
          w-full rounded-xl border-2 border-dashed px-8 py-14
          flex flex-col items-center justify-center gap-3
          transition-colors duration-150 select-none
          ${borderClass} ${disabledClass}
        `}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            inputRef.current?.click();
          }
        }}
      >
        {/* Upload icon (SVG — no external deps) */}
        <svg
          className={`h-12 w-12 ${isDragging ? "text-blue-500" : "text-zinc-400"}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
          />
        </svg>

        <div className="text-center">
          <p className="text-sm font-semibold text-zinc-700">
            {isDragging ? "Drop it!" : "Drop your CSV here"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            or{" "}
            <span className="font-medium text-blue-600 underline underline-offset-2">
              click to browse
            </span>
          </p>
          <p className="mt-2 text-xs text-zinc-400">.csv files only · max 10 MB</p>
        </div>
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {/* Hidden native file input */}
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="sr-only"
        onChange={onChange}
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}
