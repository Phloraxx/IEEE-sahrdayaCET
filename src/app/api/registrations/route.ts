import { getPayload } from 'payload'
import config from '@payload-config'
import { APIError } from 'payload'
import { requireAuth, AuthError } from '@/lib/auth'
import { applyCoupon } from '@/lib/coupons'

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
    const { eventId, formResponses, couponCode } = (await req.json()) as {
      eventId?: string
      formResponses?: Record<string, unknown>
      couponCode?: string
    }
    if (!eventId || !formResponses) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 1. Create the registration — the beforeChange hook validates the event,
    //    enforces capacity/deadline/closure, and auto-confirms free events.
    let registration
    try {
      registration = await payload.create({
        collection: 'registrations',
        data: {
          user: user.id,
          event: Number(eventId),
          userName: (formResponses.name as string) || user.name || '',
          userEmail: (formResponses.email as string) || user.email || '',
          userPhone: (formResponses.phone as string) || '',
          formResponses,
          registrationDate: new Date().toISOString(),
        },
      })
    } catch (e) {
      if (e instanceof APIError) {
        const status = e.status
        if (status === 404) {
          return Response.json({ error: 'Event not found' }, { status: 404 })
        }
        return Response.json({ error: e.message }, { status })
      }
      // Surface unique-index conflict as 409 so the client can show the
      // "already registered" message.
      const code = (e as { code?: string } | null)?.code
      if (code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return Response.json(
          { error: 'Already registered for this event' },
          { status: 409 },
        )
      }
      throw e
    }

    // 2. Free event: the hook has already set paymentStatus='not_required' and
    //    registrationStatus='confirmed', and sendConfirmation has issued the
    //    ticket. Just return the result.
    if (registration.paymentStatus === 'not_required') {
      const ticketId =
        ((registration.ticket as Record<string, unknown> | null)?.ticket_id as string) || ''
      return Response.json({
        registrationId: registration.id,
        ticketId,
        paymentRequired: false,
        amount: 0,
      })
    }

    // 3. Paid event: resolve final amount (apply coupon if any), then create order.
    const event = await payload.findByID({ collection: 'events', id: eventId, depth: 0 })
    let finalAmount = Number(event?.price) || 0

    if (couponCode) {
      try {
        const { discountedAmount } = await applyCoupon(payload, couponCode, eventId, finalAmount)
        finalAmount = discountedAmount
      } catch (e) {
        if (e instanceof APIError) {
          return Response.json({ error: e.message }, { status: e.status })
        }
        throw e
      }
    }

    const order = await payload.create({
      collection: 'orders',
      data: {
        user: user.id,
        registration: registration.id,
        amount: finalAmount,
        paymentMethod: 'upi',
        paymentStatus: 'pending',
        discountedAmount: couponCode ? finalAmount : undefined,
      },
    })

    const ddmResp = order.ddmResponse as Record<string, unknown> | undefined
    const ddmTicketId = (ddmResp?.ticketId as string) || ''
    const upiId = process.env.NEXT_PUBLIC_UPI_ID || ''

    return Response.json({
      registrationId: registration.id,
      ticketId: '',
      paymentRequired: true,
      amount: finalAmount,
      payment: {
        orderId: order.id,
        amount: finalAmount,
        ticketId: ddmTicketId,
        upiString: `upi://pay?pa=${upiId}&pn=IEEE%20Sahrdaya%20SB&am=${finalAmount}&tn=${ddmTicketId}&cu=INR`,
      },
    })
  } catch (error) {
    payload.logger.error(`Registration error: ${error}`)
    return Response.json({ error: 'Registration failed' }, { status: 500 })
  }
}
