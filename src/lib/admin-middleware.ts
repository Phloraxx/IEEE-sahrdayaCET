import { getRequestHeader } from "@tanstack/react-start/server"
import { createPB } from "@/lib/pb"
import { EMPTY_FILTER } from "@/lib/constants"
import { requireRole } from "@/lib/auth"
import type { AuthUser } from "@/types"
import { getChairSocietyIds, chairFilterFromSocietyIds } from "@/lib/chair-scope"
import type PocketBase from "pocketbase"

export interface AdminContext {
  pb: PocketBase
  userId: string
  role: string
}

/**
 * Extracts the cookie header from either the explicit `Request` or
 * the ambient TanStack Start request context. Prefer passing `request`
 * from inside API route handlers — `getRequestHeader` only works when
 * the call site is inside a server-side handler that wired the request
 * context, and API routes that don't use createServerFn may not have
 * the h3 event available.
 */
function readCookie(request?: Request): string {
  if (request) {
    return request.headers.get("cookie") || ""
  }
  try {
    return getRequestHeader("cookie") || ""
  } catch {
    return ""
  }
}

/**
 * Creates an authenticated PB client and verifies admin/chair role.
 * Returns the context with PB, userId, and role.
 * Throws AuthError on failure.
 */
export async function authenticateAdmin(request?: Request): Promise<AdminContext> {
  const cookie = readCookie(request)
  const pb = createPB(cookie)
  const { user } = await requireRole(["admin", "chair"], pb)
  return { pb, userId: user.id, role: user.role || "" }
}

/**
 * Builds a filter for chair-scoped queries.
 * Admins get no scope filter (empty string).
 * Chairs with no societies get a filter that matches nothing (`id = ""`).
 */
export async function buildChairFilter(
  ctx: AdminContext,
  scopeType: 'event' | 'registration' | 'society' | string,
): Promise<string> {
  if (ctx.role === 'admin') return ''
  const user: AuthUser = { id: ctx.userId, role: ctx.role as AuthUser['role'] }
  const societyIds = await getChairSocietyIds(ctx.pb, user)
  if (scopeType === 'event' || scopeType === 'registration' || scopeType === 'society') {
    return chairFilterFromSocietyIds(societyIds, scopeType)
  }
  // Unknown scopeType: fail closed (match nothing) rather than returning an
  // empty/unscoped filter for a chair.
  return EMPTY_FILTER
}

/**
 * Fetches society IDs once and returns both event and registration scope filters
 * in a single call, avoiding the duplicate societies query that two separate
 * `buildChairFilter` calls would trigger.
 */
export async function getChairScopeFilters(
  ctx: AdminContext,
): Promise<{ eventFilter: string; registrationFilter: string }> {
  if (ctx.role === 'admin') return { eventFilter: '', registrationFilter: '' }
  const user: AuthUser = { id: ctx.userId, role: ctx.role as AuthUser['role'] }
  const ids = await getChairSocietyIds(ctx.pb, user)
  return {
    eventFilter: chairFilterFromSocietyIds(ids, 'event'),
    registrationFilter: chairFilterFromSocietyIds(ids, 'registration'),
  }
}
