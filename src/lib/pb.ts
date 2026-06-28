import PocketBase from 'pocketbase'
import { PB_AUTH_COOKIE } from './constants'
import { logError } from './logger'

export function getPBUrl(): string {
  const url = process.env.POCKETBASE_URL
  if (!url) {
    throw new Error('POCKETBASE_URL is not configured')
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
