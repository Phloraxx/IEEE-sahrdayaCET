import { getPayload } from 'payload'
import config from '@payload-config'
import crypto from 'crypto'

export async function POST(req: Request) {
  const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET
  if (!webhookSecret || webhookSecret === 'your-webhook-secret-here') {
    return Response.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const headerSecret = req.headers.get('x-webhook-secret')
  if (!headerSecret) {
    return Response.json({ error: 'Missing webhook secret' }, { status: 401 })
  }
  const expected = Buffer.from(webhookSecret)
  const received = Buffer.from(headerSecret)
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return Response.json({ error: 'Invalid webhook secret' }, { status: 401 })
  }

  const payload = await getPayload({ config })
  try {
    const body = (await req.json()) as {
      ticketId?: string
      status?: string
      transactionId?: string
      amount?: number
    }
    const { ticketId, status, amount } = body
    if (!ticketId || !status) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (amount === undefined || amount === null) {
      return Response.json({ error: 'Missing amount field' }, { status: 400 })
    }

    const { docs } = await payload.find({
      collection: 'orders',
      where: { ddmTicketId: { equals: ticketId } },
      depth: 0,
      limit: 1,
    })
    if (docs.length === 0) {
      payload.logger.warn(`No order found for DDM ticket: ${ticketId}`)
      return Response.json({ error: 'Order not found' }, { status: 404 })
    }

    const order = docs[0] as { id: string | number; amount: number; paymentStatus: string }
    if (Number(amount) !== Number(order.amount)) {
      payload.logger.warn(`Amount mismatch for order ${order.id}: expected ${order.amount}, got ${amount}`)
      return Response.json({ error: 'Amount mismatch' }, { status: 400 })
    }

    const isSuccess = status === 'success' || status === 'completed' || status === 'paid'
    if (isSuccess && order.paymentStatus === 'paid') {
      return Response.json({ success: true, message: 'Already processed' })
    }

    // The afterChange hook `propagatePaymentToRegistration` will then update
    // the linked registration → which triggers incrementOnConfirm and
    // sendConfirmation on Registrations.
    await payload.update({
      collection: 'orders',
      id: order.id,
      data: {
        paymentStatus: isSuccess ? 'paid' : 'failed',
        ddmResponse: body,
      },
    })

    return Response.json({ success: true })
  } catch (error) {
    payload.logger.error(`Webhook error: ${error}`)
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
