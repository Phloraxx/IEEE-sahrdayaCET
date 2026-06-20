import { useCallback, useEffect, useState } from 'react'
import { pb } from '@/lib/pb'
import type { AuthUser } from '@/types'

/**
 * Reactive auth state synchronized with PocketBase authStore.
 */
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const syncUser = useCallback(() => {
    const record = pb.authStore.record as Record<string, unknown> | null
    if (record) {
      setUser({
        id: record.id as string,
        email: record.email as string,
        name: record.name as string,
        role: record.role as 'admin' | 'chair' | 'user',
      })
    } else {
      setUser(null)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    syncUser()
    const unsubscribe = pb.authStore.onChange(() => syncUser())
    return unsubscribe
  }, [syncUser])

  const signIn = useCallback(async () => {
    await pb.collection('users').authWithOAuth2({ provider: 'google' })
    // Popup-based auth: on success pb.authStore updates, our hook
    // reacts, and user is immediately authenticated in the SPA.
  }, [])

  const signOut = useCallback(() => {
    pb.authStore.clear()
    // Triggers onChange → syncUser → user = null
  }, [])

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isChair: user?.role === 'chair',
    signIn,
    signOut,
  }
}

/**
 * Client-side role-based UI gating. NOT security — PB rules handle that.
 * Use to conditionally show nav items, buttons, routes in components.
 */
export function useRoleGuard(allowed: ('admin' | 'chair' | 'user')[]) {
  const { user, isLoading } = useAuth()

  if (isLoading) return { isAllowed: false, isLoading: true, reason: 'loading' as const }
  if (!user) return { isAllowed: false, isLoading: false, reason: 'unauthenticated' as const }

  const isAllowed = allowed.includes(user.role)
  return {
    isAllowed,
    isLoading: false,
    reason: isAllowed ? undefined : ('forbidden' as const),
  }
}
