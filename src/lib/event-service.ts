import { createAdminPB } from '@/lib/pb'
import type PocketBase from 'pocketbase'

/**
 * Soft-deletes an event: marks deleted, closes registration, sets status.
 * Accepts an optional authenticated PB client. If omitted, creates an admin client.
 */
export async function softDeleteEvent(
  eventId: string,
  pb?: PocketBase,
): Promise<void> {
  const client = pb ?? createAdminPB()
  await client.collection('events').update(eventId, {
    isDeleted: true,
    status: 'cancelled',
    registrationOpen: false,
  })
}