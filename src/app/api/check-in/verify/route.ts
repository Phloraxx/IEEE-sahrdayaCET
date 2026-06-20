import { createPB, createAdminPB, escapeFilterValue } from '@/lib/pb'
import { requireAuth } from '@/lib/auth'
import { handleError } from '@/lib/api-error'
import { assertChairEventAccess } from '@/lib/chair-scope'
import { checkInRegistration } from '@/lib/registration-service'

export async function POST(req: Request) {
  try {
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireAuth(pb)
    const adminPB = createAdminPB()

    const { ticketId, eventId } = (await req.json()) as {
      ticketId?: string
      eventId?: string
    }
    if (!ticketId || !eventId) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const event = await adminPB.collection('events')
      .getOne(eventId, { fields: 'id,society,checkInEnabled' })
      .catch(() => null)
    if (!event) {
      return Response.json({ error: 'Event not found' }, { status: 404 })
    }

    await assertChairEventAccess(adminPB, user.id, user.role, eventId, undefined, event)

    const eventR = event as unknown as Record<string, unknown>
    if (!eventR.checkInEnabled) {
      return Response.json({ error: 'Check-in is not enabled for this event' }, { status: 400 })
    }

    const registration = await adminPB.collection('registrations')
      .getFirstListItem(
        'event = ' + escapeFilterValue(eventId) +
        ' && (ticketId = ' + escapeFilterValue(ticketId) +
        ' || paymentTicketId = ' + escapeFilterValue(ticketId) + ')',
        { fields: 'id,registrationStatus,checkedIn' },
      )
      .catch(() => null)

    if (!registration) {
      return Response.json({ error: 'Registration not found' }, { status: 404 })
    }

    const regR = registration as unknown as Record<string, unknown>

    if (regR.registrationStatus !== 'confirmed') {
      return Response.json({ error: 'Registration is not confirmed' }, { status: 400 })
    }

    if (regR.checkedIn) {
      return Response.json({ error: 'Already checked in', registrationId: registration.id })
    }

    await checkInRegistration(adminPB, registration.id)

    return Response.json({ success: true, registrationId: registration.id })
  } catch (error) {
    return handleError(error, 'check-in-verify')
  }
}
