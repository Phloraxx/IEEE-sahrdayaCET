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
    const { eventId, formResponses, couponCode } = await req.json()
    if (!eventId || !formResponses) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const event = await payload.findByID({ collection: 'events', id: eventId, depth: 0 })
    if (!event) {
      return Response.json({ error: 'Event not found' }, { status: 404 })
    }

    const userName = (formResponses.name as string) || session.user.name || ''
    const userEmail = (formResponses.email as string) || session.user.email || ''
    const userPhone = (formResponses.phone as string) || ''

    const registration = await payload.create({
      collection: 'registrations',
      data: {
        user: session.user.id,
        event: eventId,
        userName,
        userEmail,
        userPhone,
        formResponses,
        paymentStatus: 'pending',
        registrationStatus: 'pending',
        registrationDate: new Date().toISOString(),
      } as any,
    })

    const price = Number(event.price) || 0
    const isPaid = Boolean(event.isPaid) && price > 0

    if (!isPaid) {
      const updated = await payload.update({
        collection: 'registrations',
        id: registration.id,
        data: { paymentStatus: 'not_required', registrationStatus: 'confirmed' },
      })
      return Response.json({ registration: updated, payment_required: false })
    }

    let discountedAmount = price
    if (couponCode) {
      const coupons = await payload.find({
        collection: 'coupons',
        where: { code: { equals: couponCode } },
        depth: 0,
      })
      if (coupons.docs.length > 0) {
        const coupon = coupons.docs[0]
        if (coupon.discountType === 'percentage') {
          discountedAmount = price - (price * Number(coupon.discountValue)) / 100
        } else {
          discountedAmount = price - Number(coupon.discountValue)
        }
        discountedAmount = Math.max(0, discountedAmount)
      }
    }

    const order = await payload.create({
      collection: 'orders',
      data: {
        user: session.user.id,
        registration: registration.id,
        amount: discountedAmount,
        paymentMethod: 'upi',
        paymentStatus: 'pending',
        discountedAmount: couponCode ? discountedAmount : undefined,
      } as any,
    })

    const ddmResp = order.ddmResponse as Record<string, unknown> | undefined
    const ticketId = ddmResp?.ticketId as string || ''

    return Response.json({
      registration,
      payment_required: true,
      payment: {
        orderId: order.id,
        amount: discountedAmount,
        ticketId,
        upiString: `upi://pay?pa=souravpbijoy-2@okicici&pn=IEEE%20Sahrdaya%20SB&am=${discountedAmount}&tn=${ticketId}&cu=INR`,
      },
    })
  } catch (error) {
    payload.logger.error(`Registration error: ${error}`)
    return Response.json({ error: 'Registration failed' }, { status: 500 })
  }
}
