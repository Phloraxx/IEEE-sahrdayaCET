"use client";

import { useLocation } from "@tanstack/react-router";


const PAGE_LABELS: Record<string, string> = {
  "": "overview",
  events: "events",
  "check-in": "check-in",
  registrations: "registrations",
  payments: "payments",
  societies: "societies",
  users: "users",
};

export function AdminTopbar({ onToggleMobile }: { onToggleMobile: () => void }) {
  const pathname = useLocation().pathname;

  const segments = pathname.split("/").filter(Boolean);
  const pageSlug: string = segments.length >= 2 ? (segments[1] ?? "") : "";
  const pageLabel = PAGE_LABELS[pageSlug] || pageSlug || "overview";

  return (
    <header className="topbar">
      <button
        className="hamburger"
        onClick={onToggleMobile}
        aria-label="Toggle sidebar"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          width="16"
          height="16"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <div className="topbar-breadcrumb">
        <span className="accent">IEEE SB</span>
        <span>/</span>
        <span>{pageLabel}</span>
      </div>
    </header>
  );
}
