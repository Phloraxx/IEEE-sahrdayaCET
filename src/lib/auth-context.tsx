'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { AuthUser } from '@/types'

interface AuthContextValue {
    user: AuthUser | null
    status: 'loading' | 'authenticated' | 'unauthenticated'
    signIn: () => void
    signOut: () => void
}

const AuthContext = createContext<AuthContextValue>({
    user: null,
    status: 'loading',
    signIn: () => {},
    signOut: () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null)
    const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')

    const fetchUser = useCallback(async () => {
        try {
            const res = await fetch('/api/auth/me', { credentials: 'include' })
            if (!res.ok) {
                setUser(null)
                setStatus('unauthenticated')
                return
            }
            const data = await res.json()
            const u = data?.user || data
            if (u?.id) {
                setUser({
                    id: String(u.id),
                    email: u.email,
                    name: u.name,
                    role: u.role,
                })
                setStatus('authenticated')
            } else {
                setUser(null)
                setStatus('unauthenticated')
            }
        } catch {
            setUser(null)
            setStatus('unauthenticated')
        }
    }, [])

    useEffect(() => {
        fetchUser()
    }, [fetchUser])

    const signIn = useCallback(() => {
        window.location.href = '/'
    }, [])

    const signOut = useCallback(() => {
        fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
            setUser(null)
            setStatus('unauthenticated')
            document.cookie = 'pb_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
            window.location.href = '/'
        })
    }, [])

    return (
        <AuthContext.Provider value={{ user, status, signIn, signOut }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth(): AuthContextValue {
    return useContext(AuthContext)
}
