/**
 * NavBar.tsx — Shared top navigation bar used on both pages.
 * Active tab is highlighted; receives `activePage` prop.
 */

import Link from "next/link";

interface NavBarProps {
  activePage: "upload" | "dashboard";
}

export default function NavBar({ activePage }: NavBarProps) {
  return (
    <header className="border-b border-zinc-200 bg-white sticky top-0 z-20">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="text-sm font-semibold text-zinc-800">SLA Monitor</span>
        </div>
        <nav className="flex items-center gap-4">
          <Link
            href="/"
            className={`text-sm font-medium transition-colors pb-0.5 ${
              activePage === "upload"
                ? "text-zinc-900 border-b-2 border-zinc-900"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            Upload
          </Link>
          <Link
            href="/dashboard"
            className={`text-sm font-medium transition-colors pb-0.5 ${
              activePage === "dashboard"
                ? "text-zinc-900 border-b-2 border-zinc-900"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            Dashboard
          </Link>
        </nav>
      </div>
    </header>
  );
}
