import type PocketBase from 'pocketbase'
import type { AuthUser } from '@/types'
import { USER_ROLES, type UserRole } from '@/lib/constants'

export interface AuthResult {
  user: AuthUser
}

export class AuthError extends Error {
  status: number
  constructor(message: string, status: number = 401) {
    super(message)
    this.name = 'AuthError'
    this.status = status
  }
}

/**
 * Require an authenticated session.
 * The caller must provide a PB client created from the request cookie.
 * Returns the refreshed pb instance along with the user.
 */
export async function requireAuth(pb: PocketBase): Promise<AuthResult & { pb: PocketBase }> {
  try {
    await pb.collection('users').authRefresh()
  } catch {
    throw new AuthError('Invalid or expired session', 401)
  }

  const record = pb.authStore.record
  if (!record) throw new AuthError('Invalid or expired session', 401)

  const rawRole = typeof record.role === 'string' ? record.role : 'user'
  const role: UserRole = (USER_ROLES as readonly string[]).includes(rawRole)
    ? (rawRole as UserRole)
    : 'user'
  const googleName = typeof record.name === 'string' ? record.name.trim() : ''
  const legacyName = typeof record.display_name === 'string' ? record.display_name.trim() : ''
  const user: AuthUser = {
    id: record.id,
    email: record.email,
    name: googleName || legacyName || record.name,
    role,
  }
  return { user, pb }
}

/**
 * Require that the authenticated user has one of the given roles.
 * Throws AuthError(401) if not authenticated, AuthError(403) if role insufficient.
 */
export async function requireRole(
  roles: string[],
  pb: PocketBase,
): Promise<AuthResult & { pb: PocketBase }> {
  const result = await requireAuth(pb)
  if (!roles.includes(result.user.role || '')) {
    throw new AuthError(`Access restricted to ${roles.join(' or ')}`, 403)
  }
  return result
}
