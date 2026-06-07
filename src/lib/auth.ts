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

export async function requireAuth(): Promise<AuthResult> {
    const cookieStore = await cookies()
    const authCookie = cookieStore.get('pb_auth')?.value
    if (!authCookie) throw new AuthError('Authentication required', 401)

    const pb = createPB(`pb_auth=${authCookie}`)
    try {
        await pb.collection('users').authRefresh()
    } catch {
        throw new AuthError('Invalid or expired session', 401)
    }

    const record = pb.authStore.record as AuthUser
    return { user: { id: record.id, email: record.email, name: record.name, role: record.role } }
}

export async function requireAdmin(): Promise<AuthResult> {
    const { user } = await requireAuth()
    if (user.role !== 'admin') throw new AuthError('Admin access required', 403)
    return { user }
}

export async function requireRole(...roles: string[]): Promise<AuthResult> {
    const { user } = await requireAuth()
    if (!roles.includes(user.role || '')) {
        throw new AuthError(`Access restricted to ${roles.join(' or ')}`, 403)
    }
    return { user }
}
