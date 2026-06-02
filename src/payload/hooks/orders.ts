import type { CollectionBeforeChangeHook } from 'payload'

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
