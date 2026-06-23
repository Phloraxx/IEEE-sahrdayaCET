/**
 * Shared helpers for admin route loaders (createServerFn handlers).
 *
 * Pattern before: every admin route manually called getRequestHeader,
 * createPB, requireRole, and wrapped everything in try/catch returning [].
 * This module centralises that plumbing.
 */
import { getRequestHeader } from "@tanstack/react-start/server";
import { createPB } from "@/lib/pb";
import { requireAuth, requireRole } from "@/lib/auth";
import { logError } from "@/lib/logger";
import type PocketBase from "pocketbase";

// ─── Auth helpers ─────────────────────────────────────────────────────────────

/** Returns an authenticated PB client from the current request cookie. Throws AuthError if not authenticated. */
export async function getPBFromRequest(): Promise<PocketBase> {
  const cookie = getRequestHeader("cookie") || "";
  const pb = createPB(cookie);
  await requireAuth(pb);
  return pb;
}

/** Like getPBFromRequest but also enforces a role list. Throws AuthError(403) if role insufficient. */
export async function getPBWithRole(roles: string[]): Promise<PocketBase> {
  const cookie = getRequestHeader("cookie") || "";
  const pb = createPB(cookie);
  await requireRole(roles, pb);
  return pb;
}

// ─── Loader wrapper ───────────────────────────────────────────────────────────

export interface LoaderOptions {
  /** Roles required. Defaults to ["admin", "chair"]. */
  roles?: string[];
  /** Context label used in logError. */
  context: string;
}

/**
 * Wraps an admin server-function handler with:
 *  1. Cookie extraction + createPB.
 *  2. requireRole (defaults to admin|chair).
 *  3. Consistent logError + fallback on any error.
 *
 * @param fn    Receives an authenticated pb client; returns the loader payload.
 * @param empty Fallback value returned on auth failure or any uncaught error.
 * @param opts  Context label and optional role override.
 */
export async function adminLoader<T>(
  fn: (pb: PocketBase) => Promise<T>,
  empty: T,
  opts: LoaderOptions,
): Promise<T> {
  const roles = opts.roles ?? ["admin", "chair"];
  try {
    const cookie = getRequestHeader("cookie") || "";
    const pb = createPB(cookie);
    await requireRole(roles, pb);
    return await fn(pb);
  } catch (e) {
    // AuthError → rethrow so the route error boundary catches it (redirects to login)
    if (e && typeof e === 'object' && 'name' in e && (e as { name: string }).name === 'AuthError') {
      throw e;
    }
    logError(opts.context, e);
    return empty;
  }
}
