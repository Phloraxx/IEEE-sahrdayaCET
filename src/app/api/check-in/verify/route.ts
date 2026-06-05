import { getPayload } from 'payload'
import config from '@payload-config'
import { requireAuth, AuthError } from '@/lib/auth'
import { isChairOfSocietyForEvent } from '@/payload/access'

export async function POST(req: Request) {
  let user: { id: string; email?: string | null; name?: string | null; role?: string }
  try {
    ;({ user } = await requireAuth())
  } catch (e) {
    if (e instanceof AuthError) {
      return Response.json({ error: e.message }, { status: e.status })
    }
    return Response.json({ error: 'Authentication failed' }, { status: 401 })
  }

  const payload = await getPayload({ config })

  try {
    const { ticketId, eventId, location } = await req.json()
    if (!ticketId || !eventId) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Event-scoped authorization: admin OR chair of the event's society
    const { allowed } = await isChairOfSocietyForEvent({
      userId: user.id,
      userRole: user.role || '',
      eventId,
      payload,
    })
    if (!allowed) {
      return Response.json({ error: 'Forbidden: not a chair of this event\'s society' }, { status: 403 })
    }

    // Check if check-in is enabled for this event
    const eventDoc: any = await payload.findByID({ collection: 'events', id: eventId, depth: 0 })
    if (!eventDoc) {
      return Response.json({ error: 'Event not found' }, { status: 404 })
    }
    if (!eventDoc.checkInEnabled) {
      return Response.json({ error: 'Check-in is not enabled for this event' }, { status: 400 })
    }

    const registrations = await payload.find({
      collection: 'registrations',
      where: { event: { equals: eventId }, registrationStatus: { equals: 'confirmed' } },
      depth: 0,
    })

    const registration = (registrations.docs as any[]).find(
      (r: any) => {
        const ticket = r.ticket
        return ticket?.ticket_id === ticketId || r.paymentTicketId === ticketId
      }
    )

    if (!registration) {
      return Response.json({ error: 'Registration not found' }, { status: 404 })
    }

    if (registration.checkedIn) {
      return Response.json({ error: 'Already checked in', registrationId: registration.id })
    }

    const now = new Date().toISOString()
    const existingHistory = (registration.checkInHistory as any[]) || []
    const updatedHistory = [...existingHistory, { location: location || 'entrance', checked_in_at: now, checked_in_by: user.id }]

    await payload.update({
      collection: 'registrations',
      id: registration.id,
      data: {
        checkedIn: true,
        checkedInAt: now,
        checkedInBy: user.id,
        lastCheckInLocation: location || 'entrance',
        checkInHistory: updatedHistory,
      } as any,
    })

    return Response.json({ success: true, registrationId: registration.id })
  } catch (error) {
    payload.logger.error(`Check-in error: ${error}`)
    return Response.json({ error: 'Check-in failed' }, { status: 500 })
  }
}
