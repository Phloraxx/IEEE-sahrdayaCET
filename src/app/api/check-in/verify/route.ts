import { createPB, createAdminPB, escapeFilterValue } from '@/lib/pb'
import { requireAuth } from '@/lib/auth'
import { logError } from '@/lib/logger'
import { checkInRegistration } from '@/lib/registration-service'

export async function POST(req: Request) {
  const pb = createPB(req.headers.get('cookie') || undefined)
  const { user } = await requireAuth(pb)

  try {
    const { ticketId, eventId } = (await req.json()) as {
      ticketId?: string
      eventId?: string
    }
    if (!ticketId || !eventId) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const event = await pb.collection('events').getOne(eventId).catch(() => null)
    if (!event) {
      return Response.json({ error: 'Event not found' }, { status: 404 })
    }

    if (user.role !== 'admin') {
      const society = await pb.collection('societies').getOne(event.society).catch(() => null)
      const chairs = (society?.chairs || []) as string[]
      if (!chairs.includes(user.id)) {
        return Response.json({ error: 'Forbidden: not a chair of this event\'s society' }, { status: 403 })
      }
    }

    if (!event.checkInEnabled) {
      return Response.json({ error: 'Check-in is not enabled for this event' }, { status: 400 })
    }

    const registrations = await pb.collection('registrations').getFullList({
      filter: `event = ${escapeFilterValue(eventId)} && (ticketId = ${escapeFilterValue(ticketId)} || paymentTicketId = ${escapeFilterValue(ticketId)})`,
    })

    if (registrations.length === 0) {
      return Response.json({ error: 'Registration not found' }, { status: 404 })
    }

    const registration = registrations[0]

    if (registration.registrationStatus !== 'confirmed') {
      return Response.json({ error: 'Registration is not confirmed' }, { status: 400 })
    }

    if (registration.checkedIn) {
      return Response.json({ error: 'Already checked in', registrationId: registration.id })
    }

    // Use elevated client for the write so event.checkedInCount can be updated
    const adminPB = createAdminPB()
    await checkInRegistration(adminPB, registration.id)

    return Response.json({ success: true, registrationId: registration.id })
  } catch (error) {
    logError('check-in-verify', error)
    return Response.json({ error: 'Check-in failed' }, { status: 500 })
  }
}
