import type PocketBase from 'pocketbase'
import { escapeFilterValue } from './pb'
import { EMPTY_FILTER } from './constants'
import type { AuthUser } from '@/types'

/**
 * Centralized chair scoping — the single place that decides what a chair can see.
 * Admins see everything; chairs see only their own societies' data.
 *
 * Usage in admin routes: call `requireEventScope` / `scopeSocietyFilter` /
 * `scopeEventFilter` with the authenticated user, then build PB queries from the
 * returned filter. Never interpolate user input into a PB filter string directly.
 */

/** Returns true if the user is an admin (unscoped). */
export function isAdmin(user: AuthUser): boolean {
  return user.role === 'admin'
}

/** Returns true if the user is a chair (scoped to their societies). */
export function isChair(user: AuthUser): boolean {
  return user.role === 'chair'
}

/**
 * Pure helper that maps a list of society IDs to a PB filter string.
 * - `undefined` = admin / unscoped → '' (no restriction)
 * - empty array = chair with no societies → EMPTY_FILTER ('id = ""')
 */
export function chairFilterFromSocietyIds(
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
 * Returns a PB filter fragment that restricts an `events` query to the chair's
 * societies (via the `society` relation field), or '' for admins.
 */
export async function scopeEventFilter(
  pb: PocketBase,
  user: AuthUser,
): Promise<string> {
  const ids = await getChairSocietyIds(pb, user)
  return chairFilterFromSocietyIds(ids, 'event')
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

/**
 * Verifies that a single event is in the chair's scope.
 * Admins always pass. Chairs must own the event's society.
 * Throws an Error with a 403-appropriate message if out of scope.
 */
export async function requireEventScope(
  pb: PocketBase,
  user: AuthUser,
  eventId: string,
): Promise<void> {
  if (isAdmin(user)) return
  if (!isChair(user)) {
    throw new Error('Access restricted to admin or chair')
  }
  // Fetch the event's society, then check that society's chairs includes user.id
  const event = await pb
    .collection('events')
    .getOne(eventId, { fields: 'id,society' })
    .catch(() => null)
  if (!event) throw new Error('Event not found')
  const societyId =
    typeof event.society === 'string'
      ? event.society
      : Array.isArray(event.society) && event.society.length > 0
        ? String(event.society[0])
        : null
  if (!societyId) throw new Error('Event has no society')
  const society = await pb
    .collection('societies')
    .getOne(societyId, { fields: 'id,chairs' })
    .catch(() => null)
  if (!society) throw new Error('Society not found')
  const chairs = Array.isArray(society.chairs) ? society.chairs : []
  if (!chairs.includes(user.id)) {
    throw new Error('You can only access events for your own society')
  }
}

/**
 * Verifies that a single registration is in the chair's scope (via its event).
 * Admins always pass. Throws on out-of-scope or missing registration.
 */
export async function requireRegistrationScope(
  pb: PocketBase,
  user: AuthUser,
  registrationId: string,
): Promise<void> {
  if (isAdmin(user)) return
  if (!isChair(user)) {
    throw new Error('Access restricted to admin or chair')
  }
  const reg = await pb
    .collection('registrations')
    .getOne(registrationId, { fields: 'id,event' })
    .catch(() => null)
  if (!reg) throw new Error('Registration not found')
  const eventId =
    typeof reg.event === 'string'
      ? reg.event
      : Array.isArray(reg.event) && reg.event.length > 0
        ? String(reg.event[0])
        : null
  if (!eventId) throw new Error('Registration has no event')
  await requireEventScope(pb, user, eventId)
}
