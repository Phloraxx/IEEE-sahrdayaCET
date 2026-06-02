import type { CollectionAfterChangeHook } from 'payload'
import { generateQRCode } from '@/lib/ticketGenerator'
import { generatePaymentReceipt } from '@/lib/pdfReceiptGenerator'
import { registrationTemplate, receiptTemplate } from '@/lib/email/templates'

export const sendConfirmation: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create' && operation !== 'update') return
  if (doc.registrationStatus !== 'confirmed') return

  let ticketData = doc.ticket as Record<string, unknown> | null

  if (!ticketData?.ticket_id) {
    const ticketId = `TKT-${Math.random().toString(36).substring(2, 10).toUpperCase()}`
    let qrCode = ''
    try {
      qrCode = await generateQRCode(ticketId)
    } catch {
      req.payload.logger.warn(`Failed to generate QR code for ticket: ${ticketId}`)
    }
    ticketData = { ticket_id: ticketId, ticket_code: ticketId, qr_code: qrCode, is_scanned: false }

    await req.payload.update({
      collection: 'registrations',
      id: doc.id,
      data: { ticket: ticketData },
    })
  }

  const ticketId = ticketData?.ticket_id as string || ''

  let eventTitle = ''
  let eventDate = ''
  let eventVenue = ''
  try {
    const event = await req.payload.findByID({
      collection: 'events',
      id: doc.event as string,
      depth: 0,
    })
    eventTitle = event.title as string || ''
    eventDate = event.date ? new Date(event.date as string).toLocaleDateString('en-IN') : ''
    eventVenue = event.venue as string || ''
  } catch {
    req.payload.logger.warn(`Failed to fetch event for email: ${doc.event}`)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ieeesahrdaya.com'
  const variables = {
    student_name: (doc.userName as string) || 'Student',
    event_name: eventTitle,
    event_date: eventDate,
    event_venue: eventVenue,
    ticket_id: ticketId,
    ticket_url: ticketId ? `${appUrl}/ticket/${ticketId}` : '',
    amount: doc.paymentAmount as string,
    transaction_id: doc.paymentTicketId as string,
  }

  try {
    await req.payload.sendEmail({
      to: doc.userEmail as string,
      subject: 'Registration Confirmed',
      html: registrationTemplate(variables),
    })
  } catch (error) {
    req.payload.logger.error(`Failed to send confirmation email for ${doc.id}: ${error}`)
  }

  if (doc.paymentStatus === 'paid' && doc.paymentAmount && Number(doc.paymentAmount) > 0) {
    try {
      const pdfBuffer = await generatePaymentReceipt({
        ticketId,
        registrationId: doc.id as string,
        user: { name: (doc.userName as string) || '', email: (doc.userEmail as string) || '' },
        event: { title: eventTitle, venue: eventVenue, date: eventDate },
        payment: {
          amount: Number(doc.paymentAmount),
          transactionId: doc.paymentTicketId as string,
        },
      })

      await req.payload.sendEmail({
        to: doc.userEmail as string,
        subject: `Payment Receipt - ${eventTitle}`,
        html: receiptTemplate(variables),
        attachments: [
          {
            filename: `Receipt_${ticketId}.pdf`,
            content: Buffer.from(pdfBuffer, 'base64'),
          },
        ],
      })
    } catch (error) {
      req.payload.logger.error(`Failed to send receipt email for ${doc.id}: ${error}`)
    }
  }
}
