import { logError } from './logger'

/**
 * Build the public URL for a stored file.
 *
 * Files live in the uploads volume and are served by `src/routes/files.*`, which
 * re-checks that the record is publicly visible and that the filename matches
 * the one stored on the row. PocketBase's `/api/files/...` path is gone.
 */
export function buildFileUrl(collection: string, recordId: string, filename: string): string {
  if (!recordId || !filename) {
    logError('buildFileUrl', 'Missing recordId or filename', { collection, recordId, filename })
    return ''
  }
  if (filename.startsWith('http')) {
    // Only allow same-origin relative paths stored as absolute URLs on our domain.
    try {
      const url = new URL(filename)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
      if (url.pathname.startsWith('/files/')) return url.pathname
      return ''
    } catch { return '' }
  }
  // Files are served by the app from the uploads volume, not by PocketBase.
  return `/files/${collection}/${recordId}/${filename}`
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

