"use client";

import { useEffect } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";

export function AdminKeyboardShortcuts() {
  const navigate = useNavigate();
  const pathname = useLocation().pathname;

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Don't trigger when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
      )
        return;

      switch (e.key) {
        case "/":
          e.preventDefault();
          const searchInput = document.querySelector<HTMLInputElement>(
            'input[type="text"][placeholder*="Search"]',
          );
          if (searchInput) searchInput.focus();
          break;
        case "n":
          if (pathname.startsWith("/admin/events")) {
            e.preventDefault();
            navigate({ to: "/admin/events/new" });
          }
          break;
        case "Escape":
          // Close any open dialogs — the dialog libraries handle this natively
          break;
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, pathname]);

  return null;
}
