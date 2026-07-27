import type PocketBase from 'pocketbase'

/**
 * Soft-deletes an event by closing registration and marking it cancelled.
 * PocketBase collection rules and events.pb.js enforce whether the authenticated
 * caller may perform this transition for the event's society.
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
