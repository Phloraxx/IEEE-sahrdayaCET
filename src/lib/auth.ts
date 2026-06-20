import type PocketBase from 'pocketbase'
import type { AuthUser } from '@/types'
import { createPB } from './pb'
import { cookies } from 'next/headers'
import { PB_AUTH_COOKIE } from './constants'

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
 * If `pb` is provided it will be refreshed and used to extract the user.
 * If not, a new PocketBase instance is created from the cookie.
 * Returns the refreshed pb instance along with the user.
 */
export async function requireAuth(pb?: PocketBase): Promise<AuthResult & { pb: PocketBase }> {
  if (!pb) {
    const cookieStore = await cookies()
    const authCookie = cookieStore.get(PB_AUTH_COOKIE)?.value
    if (!authCookie) throw new AuthError('Authentication required', 401)
    pb = createPB(`${PB_AUTH_COOKIE}=${authCookie}`)
  }

  try {
    await pb.collection('users').authRefresh()
  } catch {
    throw new AuthError('Invalid or expired session', 401)
  }

  const record = pb.authStore.record
  if (!record) throw new AuthError('Invalid or expired session', 401)

  const user: AuthUser = {
    id: record.id,
    email: record.email,
    name: record.name,
    role: record.role,
  }
  return { user, pb }
}

export async function requireAdmin(pb?: PocketBase): Promise<AuthResult & { pb: PocketBase }> {
  const result = await requireAuth(pb)
  if (result.user.role !== 'admin') throw new AuthError('Admin access required', 403)
  return result
}

/**
 * Require that the authenticated user has one of the given roles.
 * Throws AuthError(401) if not authenticated, AuthError(403) if role insufficient.
 */
export async function requireRole(
  roles: string[],
  pb?: PocketBase,
): Promise<AuthResult & { pb: PocketBase }> {
  const result = await requireAuth(pb)
  if (!roles.includes(result.user.role || '')) {
    throw new AuthError(`Access restricted to ${roles.join(' or ')}`, 403)
  }
  return result
}
