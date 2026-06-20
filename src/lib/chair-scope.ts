/**
 * Helpers for scoping data access to a chair's own societies.
 * A "chair" user can only see events and registrations belonging
 * to the societies they are listed as a chair of.
 *
 * Single resolution entry point: `getChairScope()` — returns one object
 * with society IDs and ready-to-use filter expressions. Pass it down to
 * the assert helpers to avoid repeated DB hits.
 */

import type PocketBase from 'pocketbase'
import { escapeFilterValue } from './pb'
import { EMPTY_FILTER } from './constants'
import { AuthError } from './auth'

export interface ChairScope {
  /** Society IDs the chair manages. Empty for non-chairs or chairs with no societies. */
  societyIds: string[]
  /** PB filter for the `events` collection: `society = '...' || ...`. Empty = no restriction (admin). */
  societyFilter: string
  /** PB filter for `registrations` via event join: `event.society = '...' || ...`. Empty = no restriction (admin). */
  eventFilter: string
  /** True when the user is a chair with at least one society. */
  hasScope: boolean
}

const ADMIN_SCOPE: ChairScope = { societyIds: [], societyFilter: '', eventFilter: '', hasScope: false }

/**
 * Resolves chair scoping in one call. For non-chairs returns an unrestricted
 * scope (empty filters). For chairs with no societies returns a scope whose
 * filters match nothing (EMPTY_FILTER) — callers can use the filters directly.
 */
export async function getChairScope(
  pb: PocketBase,
  userId: string | undefined,
  role: string | undefined,
): Promise<ChairScope> {
  if (role !== 'chair' || !userId) return ADMIN_SCOPE

  const societyIds = await getChairSocietyIds(pb, userId)
  if (societyIds.length === 0) {
    return { societyIds: [], societyFilter: EMPTY_FILTER, eventFilter: EMPTY_FILTER, hasScope: false }
  }

  return {
    societyIds,
    societyFilter: buildSocietyFilter(societyIds),
    eventFilter: buildRegistrationsBySocietyFilter(societyIds),
    hasScope: true,
  }
}

/** Returns the society IDs a chair manages. Empty array for non-chairs/no societies. */
export async function getChairSocietyIds(pb: PocketBase, userId: string): Promise<string[]> {
  try {
    const societies = await pb.collection('societies').getFullList<{ id: string }>({
      filter: `chairs ~ ${escapeFilterValue(userId)}`,
      fields: 'id',
    })
    return societies.map((s) => s.id)
  } catch {
    return []
  }
}

/** Build a PB filter for the `events` collection restricted to the given society IDs. */
export function buildSocietyFilter(societyIds: string[]): string {
  if (societyIds.length === 0) return EMPTY_FILTER
  return societyIds.map((id) => `society = ${escapeFilterValue(id)}`).join(' || ')
}

/** Build a PB filter for `registrations` restricted via `event.society` join. */
export function buildRegistrationsBySocietyFilter(societyIds: string[]): string {
  if (societyIds.length === 0) return EMPTY_FILTER
  return societyIds.map((id) => `event.society = ${escapeFilterValue(id)}`).join(' || ')
}

/**
 * Asserts that a chair has access to a specific event (the event must belong
 * to one of their societies). Throws AuthError(403) on failure. No-op for admins.
 * Pass the pre-resolved `scope` to avoid a redundant DB hit.
 * Pass `event` (any record with a `society` field) if the caller already
 * fetched it, to avoid a second fetch here.
 */
export async function assertChairEventAccess(
  pb: PocketBase,
  userId: string | undefined,
  role: string | undefined,
  eventId: string,
  scope?: ChairScope,
  event?: Record<string, unknown> | null,
): Promise<void> {
  if (role !== 'chair' || !userId) return

  const resolvedScope = scope ?? (await getChairScope(pb, userId, role))
  if (!resolvedScope.hasScope) throw forbidden()

  const fetchedEvent = event ?? await pb.collection('events').getOne(eventId, { fields: 'id,society' }).catch(() => null)
  if (!fetchedEvent || !resolvedScope.societyIds.includes(fetchedEvent.society as string)) {
    throw forbidden()
  }
}

/** Asserts chair access to a specific society. Throws AuthError(403). No-op for admins. */
export async function assertChairSocietyAccess(
  pb: PocketBase,
  userId: string | undefined,
  role: string | undefined,
  societyId: string,
  scope?: ChairScope,
): Promise<void> {
  if (role !== 'chair' || !userId) return
  const resolvedScope = scope ?? (await getChairScope(pb, userId, role))
  if (!resolvedScope.societyIds.includes(societyId)) throw forbidden()
}

/** Asserts chair access to a registration via its event's society. Throws AuthError(403). */
export async function assertChairRegistrationAccess(
  pb: PocketBase,
  userId: string | undefined,
  role: string | undefined,
  registrationId: string,
  scope?: ChairScope,
): Promise<void> {
  if (role !== 'chair' || !userId) return

  const resolvedScope = scope ?? (await getChairScope(pb, userId, role))
  if (!resolvedScope.hasScope) throw forbidden()

  const reg = await pb
    .collection('registrations')
    .getOne(registrationId, { fields: 'id,event' })
    .catch(() => null)
  if (!reg) throw forbidden()

  const eventId = reg.event as string
  if (!eventId) throw forbidden()

  await assertChairEventAccess(pb, userId, role, eventId, resolvedScope)
}

function forbidden(): never {
  throw new AuthError('Forbidden', 403)
}
