"use client";

/**
 * UploadPageClient.tsx
 *
 * Client wrapper that owns the `refreshKey` counter shared between
 * UploadForm (increments on success) and UploadHistory (re-fetches on change).
 * Keeps app/page.tsx as a Server Component shell.
 */

import { useState } from "react";
import UploadForm from "./UploadForm";
import UploadHistory from "./UploadHistory";

export default function UploadPageClient() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="flex flex-col gap-8">
      <UploadForm onUploadSuccess={() => setRefreshKey((k) => k + 1)} />
      <UploadHistory refreshKey={refreshKey} />
    </div>
  );
}
