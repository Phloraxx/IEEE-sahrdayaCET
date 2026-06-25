"use client";

import { useState, useEffect, useCallback } from "react";

type Theme = "light" | "dark";

/**
 * Theme toggle hook. Initial theme applied by inline script in root
 * to prevent flash; this hook syncs React state to the DOM class.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("ieee-theme", next);
      } catch {
        /* localStorage unavailable */
      }
      document.documentElement.classList.toggle("dark", next === "dark");
      return next;
    });
  }, []);

  return { theme, toggle };
}
