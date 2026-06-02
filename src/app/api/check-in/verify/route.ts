import { getPayload } from 'payload'
import config from '@payload-config'
import { auth } from '@/auth'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  const payload = await getPayload({ config })

  try {
    const { ticketId, eventId, location } = await req.json()
    if (!ticketId || !eventId) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
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
      return Response.json({ error: 'Already checked in', registration })
    }

    const now = new Date().toISOString()
    const existingHistory = (registration.checkInHistory as any[]) || []
    const updatedHistory = [...existingHistory, { location: location || 'entrance', checked_in_at: now, checked_in_by: session.user.id }]

    const updated = await payload.update({
      collection: 'registrations',
      id: registration.id,
      data: {
        checkedIn: true,
        checkedInAt: now,
        checkedInBy: session.user.id,
        lastCheckInLocation: location || 'entrance',
        checkInHistory: updatedHistory,
      } as any,
    })

    try {
      const event = await payload.findByID({ collection: 'events', id: eventId, depth: 0 })
      await payload.update({
        collection: 'events',
        id: eventId,
        data: { checkedInCount: (Number((event as any).checkedInCount) || 0) + 1 },
      })
    } catch {
      payload.logger.warn('Failed to update checked in count')
    }

    return Response.json({ success: true, registration: updated })
  } catch (error) {
    payload.logger.error(`Check-in error: ${error}`)
    return Response.json({ error: 'Check-in failed' }, { status: 500 })
  }
}
