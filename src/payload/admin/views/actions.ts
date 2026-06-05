'use server'

import { getPayload } from 'payload'
import config from '@payload-config'
import { revalidatePath } from 'next/cache'
import { isChairOfSocietyForEvent } from '@/payload/access'
import { requireAuth, AuthError } from '@/lib/auth'

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string }

async function authorizeEvent(eventId: string) {
  let user: { id: string; role?: string }
  try {
    const r = await requireAuth()
    user = r.user
  } catch (e) {
    if (e instanceof AuthError) throw new Error(e.message)
    throw new Error('Authentication failed')
  }
  const payload = await getPayload({ config })
  const { allowed } = await isChairOfSocietyForEvent({
    userId: user.id,
    userRole: user.role || '',
    eventId,
    payload,
  })
  if (!allowed) throw new Error('Forbidden')
  return { user, payload }
}

export async function toggleCheckInAction(
  registrationId: string,
  eventId: string,
  nextValue: boolean,
): Promise<ActionResult> {
  try {
    const { payload } = await authorizeEvent(eventId)
    await payload.update({
      collection: 'registrations',
      id: registrationId,
      data: {
        checkedIn: nextValue,
        checkedInAt: nextValue ? new Date().toISOString() : null,
      },
    })
    revalidatePath(`/admin/event-dashboard/${eventId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to update' }
  }
}

export async function setRegistrationStatusAction(
  registrationId: string,
  eventId: string,
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired',
): Promise<ActionResult> {
  try {
    const { payload } = await authorizeEvent(eventId)
    await payload.update({
      collection: 'registrations',
      id: registrationId,
      data: { registrationStatus: status },
    })
    revalidatePath(`/admin/event-dashboard/${eventId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to update' }
  }
}
