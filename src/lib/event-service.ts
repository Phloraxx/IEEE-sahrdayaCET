import type PocketBase from 'pocketbase'

/**
 * Soft-deletes an event: marks isDeleted=true, closes registration, sets status=cancelled.
 *
 * Authorization is enforced at the API layer (requireRole + requireEventScope) before
 * this function is called. The PocketBase `updateRule` for events is set to allow chairs
 * to set isDeleted=true for their own society's events (see scripts/migrate-pb-rules.ts
 * and pb_hooks/events.pb.js), so the caller's own authenticated client is sufficient.
 */
export async function softDeleteEvent(
  eventId: string,
  pb: PocketBase,
): Promise<void> {
  await pb.collection('events').update(eventId, {
    isDeleted: true,
    status: 'cancelled',
    registrationOpen: false,
  })
}