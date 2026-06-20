import PocketBase from 'pocketbase'
import { PB_AUTH_COOKIE } from './constants'

export function createPB(cookieString?: string) {
  const url = process.env.POCKETBASE_URL
  if (!url) throw new Error('Missing POCKETBASE_URL environment variable')
  const pb = new PocketBase(url)

  if (cookieString) {
    pb.authStore.loadFromCookie(cookieString, PB_AUTH_COOKIE)
  }

  return pb
}

/**
 * Creates a PocketBase client authenticated as a superuser.
 * Throws if POCKETBASE_SUPERUSER_TOKEN is not configured — fail-closed
 * so admin routes never silently degrade to an unauthenticated client.
 */
export function createAdminPB() {
  const pb = createPB()
  const token = process.env.POCKETBASE_SUPERUSER_TOKEN
  if (!token) {
    throw new Error('POCKETBASE_SUPERUSER_TOKEN not configured')
  }
  pb.authStore.save(token, null)
  return pb
}

export function buildFileUrl(collection: string, recordId: string, filename: string): string {
  const url = process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL
  if (!url || !recordId || !filename) return ''
  return `${url}/api/files/${collection}/${recordId}/${filename}`
}

/**
 * Escapes a value for safe interpolation into a PocketBase filter string.
 * Strings are single-quoted with internal quotes doubled (SQL-style).
 */
export function escapeFilterValue(value: string | number | boolean): string {
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return `'${value.replace(/'/g, "''")}'`
}

/**
 * Validates that a value looks like a PocketBase record ID (15-char lowercase
 * alphanumerics). Use before interpolating IDs into filters as defense-in-depth.
 */
export function isValidPocketBaseId(value: string): boolean {
  return /^[a-z0-9]{15}$/.test(value)
}

/**
 * Fetches JSON from a URL with a timeout. Throws on non-ok or network error
 * (does NOT swallow errors to null). Use for unauthenticated SSR reads of the
 * PocketBase REST API where the SDK isn't needed.
 */
export async function pbFetch<T = unknown>(url: string, timeoutMs = 6000): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, next: { revalidate: 60 } })
    if (!res.ok) {
      const err = new Error(`PocketBase request failed: ${res.status} ${res.statusText}`)
      ;(err as Error & { status: number }).status = res.status
      throw err
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}
