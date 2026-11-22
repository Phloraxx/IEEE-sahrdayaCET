"use client";
import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * `useReducedMotion`, but false until the component is mounted.
 *
 * The server cannot see the media query, so it renders the motion branch. A
 * component that reads the preference during render therefore produces markup
 * the browser disagrees with, and React tears down and re-renders that subtree
 * (React error #418) — which is exactly what happened to the home rails.
 *
 * Deferring the preference by one render keeps the server output and the first
 * client render identical, then applies the preference. The only cost is one
 * frame of motion for a visitor who asked not to see it.
 */
export function useHydratedReducedMotion() {
  const prefersReducedMotion = Boolean(useReducedMotion());
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && prefersReducedMotion;
}
