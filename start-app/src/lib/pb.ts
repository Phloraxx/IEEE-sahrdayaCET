import PocketBase from 'pocketbase'

const PB_URL = import.meta.env.VITE_POCKETBASE_URL || 'https://db.phloraxx.us.to'

/**
 * Singleton PocketBase client for the browser.
 *
 * The JS SDK handles:
 * - Auth token in localStorage
 * - OAuth2 PKCE via popup
 * - Automatic refresh
 * - Realtime subscriptions
 *
 * No server involved. Requests go _directly_ from browser → PB REST API.
 */
export const pb = new PocketBase(PB_URL)

/**
 * Subscribe to auth state changes.
 *
 * Usage:
 *   const unsubscribe = onAuthChange((token, record) => {
 *     setUser(record ? { id: record.id, ... } : null)
 *   })
 *   return unsubscribe
 */
export function onAuthChange(cb: (token: string, record: Record<string, unknown> | null) => void): () => void {
  return pb.authStore.onChange(cb)
}

/**
 * Build a file URL for a collection record attachment.
 */
export function buildFileUrl(
  collection: string,
  recordId: string,
  filename: string,
  thumb?: string,
): string {
  if (!recordId || !filename) return ''
  return pb.files.getUrl(
    { id: recordId, collectionId: collection } as Record<string, unknown>,
    filename,
    { thumb },
  )
}

/**
 * Escapes a value for safe interpolation into a PocketBase filter string.
 */
export function escapeFilterValue(value: string | number | boolean): string {
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return `'${value.replace(/'/g, "''")}'`
}
