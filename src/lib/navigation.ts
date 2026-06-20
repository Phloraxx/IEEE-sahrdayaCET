import { usePathname as useNextPathname, useRouter as useNextRouter, redirect as nextRedirect } from 'next/navigation'
import type { NavigateOptions } from 'next/dist/shared/lib/app-router-context.shared-runtime'

/**
 * Navigation shim — abstracts next/navigation so components work under both
 * Next.js (current) and TanStack Start (migration target). During the TanStack
 * port, swap these to TanStack router equivalents.
 */
export function usePathname(): string {
  return useNextPathname()
}

export function useRouter() {
  return useNextRouter()
}

export function redirect(path: string): never {
  return nextRedirect(path)
}

export type { NavigateOptions }
