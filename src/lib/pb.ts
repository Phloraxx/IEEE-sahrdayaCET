import PocketBase from 'pocketbase'
import { PB_AUTH_COOKIE } from './constants'
import { logError } from './logger'

function getPBUrl(): string {
  const url =
    process.env.POCKETBASE_URL ||
    (typeof import.meta !== 'undefined' ? import.meta.env.VITE_POCKETBASE_URL : '')
  if (!url) {
    throw new Error('POCKETBASE_URL (or VITE_POCKETBASE_URL) is not configured')
  }
  return url
}

export function createPB(cookieString?: string) {
  const pb = new PocketBase(getPBUrl())
  if (cookieString) {
    pb.authStore.loadFromCookie(cookieString, PB_AUTH_COOKIE)
  }
  return pb
}

/**
 * Creates a PocketBase client for use in browser context.
 * Routes through the app's server proxy (/api/*) instead of
 * connecting directly to PocketBase, avoiding mixed-content
 * and CORS issues.
 */
export function createClientPB(): PocketBase {
  if (typeof window === 'undefined') {
    throw new Error('createClientPB() must only be called in browser context')
  }
  const url = import.meta.env.VITE_POCKETBASE_URL
  if (!url) throw new Error('VITE_POCKETBASE_URL is not configured')
  const pb = new PocketBase(url)
  // PocketBase CORS is set to '*' which doesn't work with credentials.
  // Public pages don't need auth cookies — disable credentials for CORS.
  pb.beforeSend = (url, options) => {
    options.credentials = 'omit'
    return { url, options }
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
  if (!recordId || !filename) {
    logError('buildFileUrl', 'Missing recordId or filename', { collection, recordId, filename })
    return ''
  }
  if (filename.startsWith('http')) return filename
  return `/api/files/${collection}/${recordId}/${filename}`
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
