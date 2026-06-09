import { createAdminPB, escapeFilterValue } from '@/lib/pb'
import crypto from 'crypto'
import { logError } from '@/lib/logger'
import { confirmRegistration } from '@/lib/registration-service'

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
  if (expected.length !== received.length) {
    return Response.json({ error: 'Invalid webhook secret' }, { status: 401 })
  }
  if (!crypto.timingSafeEqual(expected, received)) {
    return Response.json({ error: 'Invalid webhook secret' }, { status: 401 })
  }

  const pb = createAdminPB()

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

    const registrations = await pb.collection('registrations').getFullList({
      filter: `paymentTicketId = ${escapeFilterValue(ticketId)}`,
    })
    if (registrations.length === 0) {
      return Response.json({ error: 'Registration not found' }, { status: 404 })
    }

    const registration = registrations[0]
    if (Number(amount) !== Number(registration.amount)) {
      return Response.json({ error: 'Amount mismatch' }, { status: 400 })
    }

    const isSuccess = status === 'success' || status === 'completed' || status === 'paid'
    if (isSuccess && registration.paymentStatus === 'paid') {
      return Response.json({ success: true, message: 'Already processed' })
    }

    await pb.collection('registrations').update(registration.id, {
      paymentStatus: isSuccess ? 'paid' : 'failed',
      paymentData: body,
    })

    // If payment succeeded, confirm the registration:
    // sets registrationStatus to 'confirmed', generates ticket,
    // and increments event.registeredCount (only on first confirmation).
    if (isSuccess) {
      await confirmRegistration(pb, registration.id)
    }

    return Response.json({ success: true })
  } catch (error) {
    logError('payment-webhook', error)
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
