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
  const url = getPBUrl()
  if (!recordId || !filename) {
    logError('buildFileUrl', 'Missing recordId or filename', { collection, recordId, filename })
    return ''
  }
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
