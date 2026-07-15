'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { AuthUser } from '@/types'
import { logError } from './logger'
interface AuthContextValue {
    user: AuthUser | null
    status: 'loading' | 'authenticated' | 'unauthenticated'
    signIn: () => void
    signOut: () => void
}

const AuthContext = createContext<AuthContextValue>({
    user: null,
    status: 'loading',
    signIn: () => {/* set by AuthProvider */},
    signOut: () => {/* set by AuthProvider */},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null)
    const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')

    const fetchUser = useCallback(async () => {
        try {
            const res = await fetch('/api/auth/me', { credentials: 'include' })
            if (res.status === 401) {
                setUser(null)
                setStatus('unauthenticated')
                return
            }
            if (!res.ok) {
                logError('auth-check', `${res.status} ${res.statusText}`)
                setUser(null)
                setStatus('unauthenticated')
                return
            }
            const data = await res.json()
            const u = data?.user
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
        } catch (err) {
            logError('auth-network', err)
            setUser(null)
            setStatus('unauthenticated')
        }
    }, [])

    useEffect(() => {
        fetchUser()
    }, [fetchUser])

    const signIn = useCallback(async () => {
        try {
            const res = await fetch('/api/auth/init', { credentials: 'include' })
            const data = await res.json().catch(() => ({} as { authURL?: string; error?: string }))
            if (res.ok && typeof data.authURL === 'string' && data.authURL) {
                window.location.href = data.authURL
                return
            }
            logError('auth-signin', data.error || `${res.status} ${res.statusText}`)
        } catch (err) {
            logError('auth-signin', err)
        }
    }, [])

    const signOut = useCallback(async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
        } finally {
            // Defense-in-depth: attempt client-side cookie clearing.
            // HttpOnly cookies cannot be cleared from JS, but this covers
            // any non-HttpOnly auth cookies that may exist.
            const clear = (name: string) => {
                document.cookie = `${name}=; path=/; max-age=0`
                document.cookie = `${name}=; path=/; max-age=0; domain=${window.location.hostname}`
            }
            clear('pb_auth')
            clear('pb_oauth_provider')
            setUser(null)
            setStatus('unauthenticated')
            window.location.href = '/'
        }
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
