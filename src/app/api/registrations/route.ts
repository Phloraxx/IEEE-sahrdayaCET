import { createPB, buildFileUrl, escapeFilterValue } from '@/lib/pb'
import { requireAuth } from '@/lib/auth'
import { ClientResponseError } from 'pocketbase'
import crypto from 'crypto'
import { logError } from '@/lib/logger'

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
    ? `user = ${escapeFilterValue(user.id)} && event = ${escapeFilterValue(eventId)}`
    : `user = ${escapeFilterValue(user.id)}`

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
                ? buildFileUrl('events', evt.id as string, evt.banner as string)
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
    logError('registrations-get', error)
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

    const now = new Date().toISOString()

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

    // Fetch event for price info (the hook already validated it exists)
    const event = await pb.collection('events').getOne(eventId)
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
    if (error instanceof ClientResponseError) {
      return Response.json(
        { error: error.data?.message || 'Registration failed' },
        { status: error.status },
      )
    }
    logError('registrations-post', error)
    return Response.json({ error: 'Registration failed' }, { status: 500 })
  }
}
