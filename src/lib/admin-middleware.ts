import { getRequestHeader } from "@tanstack/react-start/server"
import { createPB, escapeFilterValue } from "@/lib/pb"
import { requireRole } from "@/lib/auth"
import type { AuthUser } from "@/types"
import { getChairSocietyIds } from "@/lib/chair-scope"
import type PocketBase from "pocketbase"

export interface AdminContext {
  pb: PocketBase
  userId: string
  role: string
}

/**
 * Creates an authenticated PB client and verifies admin/chair role.
 * Returns the context with PB, userId, and role.
 * Throws AuthError on failure.
 */
export async function authenticateAdmin(): Promise<AdminContext> {
  const cookie = getRequestHeader("cookie") || ""
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
  if (!societyIds || societyIds.length === 0) return 'id = ""'

  switch (scopeType) {
    case 'event':
      return societyIds.map(id => `society = ${escapeFilterValue(id)}`).join(' || ')
    case 'registration':
      return societyIds.map(id => `event.society = ${escapeFilterValue(id)}`).join(' || ')
    case 'society':
      return societyIds.map(id => `id = ${escapeFilterValue(id)}`).join(' || ')
    default:
      return ''
  }
}
