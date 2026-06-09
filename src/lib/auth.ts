import type PocketBase from 'pocketbase'
import type { AuthUser } from '@/types'
import { createPB } from './pb'
import { cookies } from 'next/headers'

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
        const authCookie = cookieStore.get('pb_auth')?.value
        if (!authCookie) throw new AuthError('Authentication required', 401)
        pb = createPB(`pb_auth=${authCookie}`)
    }

    try {
        await pb.collection('users').authRefresh()
    } catch {
        throw new AuthError('Invalid or expired session', 401)
    }

    const record = pb.authStore.record as AuthUser
    return {
        user: { id: record.id, email: record.email, name: record.name, role: record.role },
        pb,
    }
}

export async function requireAdmin(pb?: PocketBase): Promise<AuthResult & { pb: PocketBase }> {
    const result = await requireAuth(pb)
    if (result.user.role !== 'admin') throw new AuthError('Admin access required', 403)
    return result
}

export async function requireRole(...roles: string[]): Promise<AuthResult & { pb: PocketBase }>;
export async function requireRole(roles: string[], pb?: PocketBase): Promise<AuthResult & { pb: PocketBase }>;
export async function requireRole(...args: unknown[]): Promise<AuthResult & { pb: PocketBase }> {
    // Support both: requireRole('admin', 'chair') and requireRole(['admin', 'chair'], pb)
    let roles: string[]
    let pb: PocketBase | undefined

    if (Array.isArray(args[0])) {
        // Signature: requireRole(['admin', 'chair'], pb?)
        roles = args[0] as string[]
        pb = args[1] as PocketBase | undefined
    } else {
        // Signature: requireRole('admin', 'chair')
        roles = args as string[]
    }

    const result = await requireAuth(pb)
    if (!roles.includes(result.user.role || '')) {
        throw new AuthError(`Access restricted to ${roles.join(' or ')}`, 403)
    }
    return result
}
