import type { CollectionAfterChangeHook, CollectionBeforeChangeHook } from 'payload'

export const createDdmTicket: CollectionBeforeChangeHook = async ({ data, operation }) => {
  if (operation === 'create' && data.paymentMethod === 'upi' && data.amount > 0) {
    const apiUrl = process.env.PAYMENT_API_URL
    if (!apiUrl) throw new Error('PAYMENT_API_URL not configured')

    const response = await fetch(`${apiUrl}/ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: data.amount,
        metadata: {
          registrationId: data.registration,
          userId: data.user,
        },
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to create DDM payment ticket')
    }

    const ticket = await response.json()
    return {
      ...data,
      ddmTicketId: ticket.ticketId,
      ddmResponse: ticket,
    }
  }
  return data
}

/**
 * When an order transitions to 'paid', propagate the payment to the linked
 * registration. The afterChange chain on Registrations then handles:
 *   - incrementOnConfirm (registeredCount)
 *   - sendConfirmation (ticket + email)
 */
export const propagatePaymentToRegistration: CollectionAfterChangeHook = async ({
  doc, previousDoc, req,
}) => {
  if (doc.paymentStatus !== 'paid') return
  if (previousDoc?.paymentStatus === 'paid') return
  if (!doc.registration) return

  const regId = typeof doc.registration === 'object'
    ? (doc.registration as { id: string | number }).id
    : doc.registration

  const ddmResp = doc.ddmResponse as Record<string, unknown> | undefined
  const paymentTicketId =
    (typeof ddmResp?.transactionId === 'string' ? (ddmResp.transactionId as string) : null)
    || (typeof ddmResp?.transaction_id === 'string' ? (ddmResp.transaction_id as string) : null)
    || doc.ddmTicketId
    || ''

  try {
    await req.payload.update({
      collection: 'registrations',
      id: regId,
      data: {
        paymentStatus: 'paid',
        paymentTicketId,
        paymentAmount: doc.amount,
        registrationStatus: 'confirmed',
      },
    })
  } catch (e) {
    req.payload.logger.error(`Failed to propagate payment to registration ${regId}: ${e}`)
  }
}
