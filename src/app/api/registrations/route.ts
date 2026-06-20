import { createPB, createAdminPB, buildFileUrl, escapeFilterValue } from '@/lib/pb'
import { requireAuth } from '@/lib/auth'
import { handleError } from '@/lib/api-error'
import { z } from 'zod'
import { createRegistration, RegistrationError } from '@/lib/registration-service'

const RegistrationBodySchema = z.object({
  eventId: z.string().min(1, 'eventId is required'),
  formResponses: z.record(z.string(), z.unknown()).default({}),
  couponCode: z.string().optional(),
})

export async function GET(req: Request) {
  try {
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireAuth(pb)

    const url = new URL(req.url)
    const eventId = url.searchParams.get('eventId')
    const ticketId = url.searchParams.get('ticketId')

    // Build filter — support filtering by ticketId (used by the ticket page)
    const parts: string[] = [`user = ${escapeFilterValue(user.id)}`]
    if (eventId) parts.push(`event = ${escapeFilterValue(eventId)}`)
    if (ticketId) parts.push(`(ticketId = ${escapeFilterValue(ticketId)} || paymentTicketId = ${escapeFilterValue(ticketId)})`)
    const filter = parts.join(' && ')

    const perPage = ticketId ? 1 : 50
    const result = await pb.collection('registrations').getList(1, perPage, {
      filter,
      sort: '-created',
      expand: 'event',
      fields: 'id,event,ticketId,paymentTicketId,paymentStatus,registrationStatus,formResponses,checkedIn,checkedInAt,created,registrationDate,expand',
    })

    const items = result.items.map((reg) => {
      const r = reg as unknown as Record<string, unknown>
      const expand = r.expand as Record<string, unknown> | undefined
      const evt = expand?.event as Record<string, unknown> | undefined
      return {
        id: r.id as string,
        ticket: r.ticketId
          ? {
              id: r.ticketId as string,
              qr_data: r.ticketId as string,
              is_scanned: !!r.checkedIn,
              scanned_at: (r.checkedInAt as string) || null,
              createdAt: (r.created as string) || (r.registrationDate as string),
            }
          : null,
        event: evt
          ? {
              id: evt.id as string,
              title: evt.title as string,
              description: evt.description as string,
              date: evt.date as string,
              venue: evt.venue as string,
              price: Number(evt.price) || 0,
              bannerUrl: evt.banner ? buildFileUrl('events', evt.id as string, evt.banner as string) : '',
              status: (evt.status as string) || 'published',
            }
          : null,
        registration: {
          id: r.id as string,
          eventId: r.event as string,
          paymentStatus: (r.paymentStatus as string) || 'pending',
          registrationStatus: (r.registrationStatus as string) || 'pending',
          formResponses: r.formResponses || {},
          createdAt: (r.created as string) || (r.registrationDate as string),
          updatedAt: (r.created as string) || (r.registrationDate as string),
        },
      }
    })

    return Response.json({
      items,
      total: result.totalItems,
      limit: result.perPage,
      page: result.page,
      totalPages: result.totalPages,
    })
  } catch (error) {
    return handleError(error, 'registrations-get')
  }
}

export async function POST(req: Request) {
  try {
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireAuth(pb)

    const parsed = RegistrationBodySchema.parse(await req.json())
    const { eventId, formResponses, couponCode } = parsed

    const adminPB = createAdminPB()
    const result = await createRegistration(pb, adminPB, {
      userId: user.id,
      eventId,
      userName: ((formResponses as Record<string, unknown>).name as string) || '',
      userEmail: ((formResponses as Record<string, unknown>).email as string) || '',
      userPhone: ((formResponses as Record<string, unknown>).phone as string) || '',
      formResponses: formResponses as Record<string, unknown>,
      couponCode,
    })

    return Response.json({
      registrationId: result.registrationId,
      ticketId: result.paymentTicketId || result.registrationId,
      paymentRequired: result.paymentRequired,
      amount: result.amount,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')
      return Response.json({ error: `Validation failed: ${messages}` }, { status: 400 })
    }
    if (error instanceof RegistrationError) {
      return Response.json({ error: error.message }, { status: error.statusCode })
    }
    return handleError(error, 'registrations-post')
  }
}
