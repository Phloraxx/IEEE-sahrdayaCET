import type PocketBase from 'pocketbase'
import { escapeFilterValue } from './pb'
import { EMPTY_FILTER } from './constants'
import type { AuthUser } from '@/types'

/**
 * Centralized chair scoping — the single place that decides what a chair can see.
 * Admins see everything; chairs see only their own societies' data.
 *
 * Admin clients use these helpers only to narrow queries for UX; PocketBase
 * collection rules remain the authoritative authorization boundary.
 */

/** Returns true if the user is an admin (unscoped). */
function isAdmin(user: AuthUser): boolean {
  return user.role === 'admin'
}

/** Returns true if the user is a chair (scoped to their societies). */
function isChair(user: AuthUser): boolean {
  return user.role === 'chair'
}

/**
 * Pure helper that maps a list of society IDs to a PB filter string.
 * - `undefined` = admin / unscoped → '' (no restriction)
 * - empty array = chair with no societies → EMPTY_FILTER ('id = ""')
 */
function chairFilterFromSocietyIds(
  ids: string[] | undefined,
  scopeType: 'event' | 'registration' | 'society',
): string {
  if (ids === undefined) return ''
  if (ids.length === 0) return EMPTY_FILTER
  switch (scopeType) {
    case 'event':
      return ids.map((id) => `society = ${escapeFilterValue(id)}`).join(' || ')
    case 'registration':
      return ids.map((id) => `event.society = ${escapeFilterValue(id)}`).join(' || ')
    case 'society':
      return ids.map((id) => `id = ${escapeFilterValue(id)}`).join(' || ')
  }
}

/**
 * Fetches the IDs of societies a chair manages. Admins get undefined (no scope).
 * Throws if the user is neither admin nor chair — caller should have already
 * passed `requireRole(["admin","chair"])`.
 */
export async function getChairSocietyIds(
  pb: PocketBase,
  user: AuthUser,
): Promise<string[] | undefined> {
  if (isAdmin(user)) return undefined // unscoped
  if (!isChair(user)) return []
  const societies = await pb.collection('societies').getFullList({
    filter: `chairs ?= ${escapeFilterValue(user.id)}`,
    fields: 'id',
  })
  return societies.map((s) => s.id)
}

/**
 * Returns a PB filter fragment that restricts a `societies` query to the
 * chair's societies, or '' for admins (no restriction). Returns EMPTY_FILTER
 * if the chair has no societies (matches nothing safely).
 */
export async function scopeSocietyFilter(
  pb: PocketBase,
  user: AuthUser,
): Promise<string> {
  const ids = await getChairSocietyIds(pb, user)
  return chairFilterFromSocietyIds(ids, 'society')
}

/**
 * Returns a PB filter fragment that restricts a `registrations` query to events
 * belonging to the chair's societies (via event → society relation), or '' for admins.
 *
 * Registrations have `event` field; events have `society` field.
 * This resolves the chain: registration → event → society.
 */
export async function scopeRegistrationFilter(
  pb: PocketBase,
  user: AuthUser,
): Promise<string> {
  const ids = await getChairSocietyIds(pb, user)
  return chairFilterFromSocietyIds(ids, 'registration')
}
