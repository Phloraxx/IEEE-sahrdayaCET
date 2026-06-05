import { auth } from '@/auth'

export interface AuthUser {
    id: string
    email?: string | null
    name?: string | null
    role?: string
}

export interface AuthResult {
    user: AuthUser
}

export async function requireAuth(): Promise<AuthResult> {
    const session = await auth()
    if (!session?.user?.id) {
        throw new AuthError('Authentication required', 401)
    }
    return {
        user: {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
            role: (session.user as { role?: string }).role,
        },
    }
}

export class AuthError extends Error {
    status: number
    constructor(message: string, status: number = 401) {
        super(message)
        this.name = 'AuthError'
        this.status = status
    }
}
