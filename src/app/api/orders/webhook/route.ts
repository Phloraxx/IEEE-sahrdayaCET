import { getPayload } from 'payload'
import config from '@payload-config'

export async function POST(req: Request) {
  const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET
  if (webhookSecret) {
    const headerSecret = req.headers.get('x-webhook-secret')
    if (headerSecret !== webhookSecret) {
      return Response.json({ error: 'Invalid webhook secret' }, { status: 401 })
    }
  }

  const payload = await getPayload({ config })

  try {
    const body = await req.json()
    const { ticketId, status, transactionId, senderName, rrn, upiId, amount } = body

    if (!ticketId || !status) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const orders = await payload.find({
      collection: 'orders',
      where: { ddmTicketId: { equals: ticketId } },
      depth: 0,
    })

    if (orders.docs.length === 0) {
      payload.logger.warn(`No order found for DDM ticket: ${ticketId}`)
      return Response.json({ error: 'Order not found' }, { status: 404 })
    }

    const order = orders.docs[0]
    const isSuccess = status === 'success' || status === 'completed' || status === 'paid'

    await payload.update({
      collection: 'orders',
      id: order.id,
      data: {
        paymentStatus: isSuccess ? 'paid' : 'failed',
        ddmResponse: body,
      },
    })

    if (isSuccess) {
      await payload.update({
        collection: 'registrations',
        id: order.registration as any,
        data: {
          paymentStatus: 'paid',
          paymentTicketId: transactionId || ticketId,
          registrationStatus: 'confirmed',
        } as any,
      })
    }

    return Response.json({ success: true })
  } catch (error) {
    payload.logger.error(`Webhook error: ${error}`)
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
