import { createPB, createAdminPB, buildFileUrl, escapeFilterValue } from '@/lib/pb'
import { requireAuth } from '@/lib/auth'
import { ClientResponseError } from 'pocketbase'
import { logError } from '@/lib/logger'
import { z } from 'zod'
import { createRegistration, RegistrationError } from '@/lib/registration-service'

const RegistrationBodySchema = z.object({
  eventId: z.string().min(1, 'eventId is required'),
  formResponses: z
    .object({
      name: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
    })
    .passthrough()
    .refine((val) => typeof val === 'object' && val !== null, 'formResponses must be an object'),
})

export async function GET(req: Request) {
  const pb = createPB(req.headers.get('cookie') || undefined)
  let user
  try {
    const auth = await requireAuth(pb)
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
  const { user } = await requireAuth(pb)

  try {
    const parsed = RegistrationBodySchema.parse(await req.json())
    const { eventId, formResponses } = parsed

    const adminPB = createAdminPB()
    const result = await createRegistration(pb, adminPB, {
      userId: user.id,
      eventId,
      userName: (formResponses.name as string) || '',
      userEmail: (formResponses.email as string) || '',
      userPhone: (formResponses.phone as string) || '',
      formResponses,
    })

    return Response.json({
      registrationId: result.registrationId,
      ticketId: result.ticketId,
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
