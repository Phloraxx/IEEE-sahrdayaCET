import { createPB } from '@/lib/pb'
import { requireAuth } from '@/lib/auth'
import crypto from 'crypto'

export async function GET(req: Request) {
  const pb = createPB(req.headers.get('cookie') || undefined)
  let user
  try {
    const auth = await requireAuth()
    user = auth.user
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const eventId = url.searchParams.get('eventId')

  const filter = eventId
    ? `user = '${user.id}' && event = '${eventId}'`
    : `user = '${user.id}'`

  try {
    const result = await pb.collection('registrations').getList(1, 50, {
      filter,
      sort: '-created',
      expand: 'event',
    })

    const docs = await Promise.all((result.items || []).map(async (reg: Record<string, unknown>) => {
      const evt = (reg as any).expand?.event as Record<string, unknown> | undefined
      return {
        ticket: (reg as any).ticketId
          ? {
              id: (reg as any).ticketId,
              qr_data: (reg as any).ticketId,
              is_scanned: (reg as any).checkedIn || false,
              scanned_at: (reg as any).checkedInAt || null,
              createdAt: (reg as any).created || (reg as any).registrationDate,
            }
          : null,
        event: evt
          ? {
              id: evt.id,
              title: evt.title,
              description: evt.description,
              date: evt.date,
              venue: evt.venue,
              price: (evt.price as number) || 0,
              bannerUrl: evt.banner
                ? `${process.env.POCKETBASE_URL}/api/files/events/${evt.id}/${evt.banner}`
                : '',
              status: evt.status || 'published',
            }
          : null,
        registration: {
          id: (reg as any).id,
          eventId: (reg as any).event,
          paymentStatus: (reg as any).paymentStatus || 'pending',
          registrationStatus: (reg as any).registrationStatus || 'pending',
          formResponses: (reg as any).formResponses || {},
          createdAt: (reg as any).created || (reg as any).registrationDate,
          updatedAt: (reg as any).updated || (reg as any).registrationDate,
        },
      }
    }))

    return Response.json({
      docs,
      totalDocs: result.totalItems,
      limit: result.perPage,
      page: result.page,
      totalPages: result.totalPages,
    })
  } catch (error) {
    return Response.json({ error: 'Failed to fetch registrations' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const pb = createPB(req.headers.get('cookie') || undefined)
  const { user } = await requireAuth()

  try {
    const { eventId, formResponses } = (await req.json()) as {
      eventId?: string
      formResponses?: Record<string, unknown>
    }
    if (!eventId || !formResponses) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const event = await pb.collection('events').getOne(eventId).catch(() => null)
    if (!event) {
      return Response.json({ error: 'Event not found' }, { status: 404 })
    }

    const now = new Date().toISOString()

    const existing = await pb.collection('registrations').getFullList({
      filter: `user = '${user.id}' && event = '${eventId}'`,
      fields: 'id',
    })
    if (existing.length > 0) {
      return Response.json({ error: 'Already registered for this event' }, { status: 409 })
    }

    const registration = await pb.collection('registrations').create({
      user: user.id,
      event: eventId,
      userName: (formResponses.name as string) || '',
      userEmail: (formResponses.email as string) || '',
      userPhone: (formResponses.phone as string) || '',
      formResponses,
      registrationDate: now,
    })

    if (registration.paymentStatus === 'not_required') {
      return Response.json({
        registrationId: registration.id,
        ticketId: registration.ticketId || '',
        paymentRequired: false,
        amount: 0,
      })
    }

    const finalAmount = Number(event.price) || 0
    const paymentTicketId = crypto.randomUUID()

    await pb.collection('registrations').update(registration.id, {
      paymentStatus: 'pending',
      paymentTicketId,
      amount: finalAmount,
    })

    return Response.json({
      registrationId: registration.id,
      ticketId: paymentTicketId,
      paymentRequired: true,
      amount: finalAmount,
    })
  } catch (error) {
    return Response.json({ error: 'Registration failed' }, { status: 500 })
  }
}
