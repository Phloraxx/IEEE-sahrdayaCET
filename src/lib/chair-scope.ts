/**
 * Helpers for scoping data access to a chair's own societies.
 * A "chair" user can only see events and registrations belonging
 * to the societies they are listed as a chair of.
 */

import { escapeFilterValue } from './pb'

export async function getChairSocietyIds(pb: import('pocketbase').default, userId: string): Promise<string[]> {
  try {
    const societies = await pb.collection('societies').getFullList<{ id: string }>({
      filter: `chairs ~ ${escapeFilterValue(userId)}`,
      fields: 'id',
    })
    return (societies || []).map((s) => s.id)
  } catch {
    return []
  }
}

/**
 * Build a PocketBase filter expression that restricts to events
 * belonging to the given society IDs. Returns empty string if
 * societyIds is empty (meaning no access).
 */
export function buildSocietyFilter(societyIds: string[]): string {
  if (societyIds.length === 0) return 'id = ""' // impossible filter — no access
  return societyIds.map((id) => `society = ${escapeFilterValue(id)}`).join(' || ')
}

/**
 * Build a PocketBase filter expression that restricts registrations
 * to events belonging to the given society IDs. Returns empty string
 * if societyIds is empty.
 */
export function buildRegistrationsBySocietyFilter(societyIds: string[]): string {
  if (societyIds.length === 0) return 'id = ""'
  return societyIds.map((id) => `event.society = ${escapeFilterValue(id)}`).join(' || ')
}
