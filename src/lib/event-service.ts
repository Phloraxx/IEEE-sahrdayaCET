import type PocketBase from 'pocketbase'

/**
 * Soft-deletes an event: marks deleted, closes registration, sets status.
 * Runs on the caller's authenticated client — the `events.update` rule allows
 * admins and owning chairs, which every caller already is. No elevated client.
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