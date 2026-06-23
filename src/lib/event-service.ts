import { createAdminPB } from '@/lib/pb'

/**
 * Soft-deletes an event: marks deleted, closes registration, sets status.
 */
export async function softDeleteEvent(
  eventId: string,
): Promise<void> {
  const adminPB = createAdminPB()
  await adminPB.collection('events').update(eventId, {
    isDeleted: true,
    status: 'cancelled',
    registrationOpen: false,
  })
}