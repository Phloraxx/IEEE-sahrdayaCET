import { logError } from './logger'

export function buildFileUrl(collection: string, recordId: string, filename: string): string {
  if (!recordId || !filename) {
    logError('buildFileUrl', 'Missing recordId or filename', { collection, recordId, filename })
    return ''
  }
  if (filename.startsWith('http')) {
    try {
      const url = new URL(filename)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
      return filename
    } catch { return '' }
  }
  return `/api/files/${collection}/${recordId}/${filename}`
}

/**
 * Escapes a value for safe interpolation into a PocketBase filter string.
 * Strings are single-quoted with internal quotes doubled (SQL-style).
 */
export function escapeFilterValue(value: string | number | boolean): string {
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return `'${value.replace(/\0/g, '').replace(/'/g, "''")}'`
}

