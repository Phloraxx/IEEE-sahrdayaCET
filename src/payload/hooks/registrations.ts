import type { CollectionAfterChangeHook, CollectionBeforeChangeHook } from 'payload'
import { APIError } from 'payload'
import { sql, eq } from '@payloadcms/db-sqlite/drizzle'
import crypto from 'crypto'
import { generateQRBase64 } from '@/lib/qr'
import { generatePaymentReceipt } from '@/lib/pdfReceiptGenerator'
import { registrationTemplate, receiptTemplate } from '@/lib/email/templates'

/**
 * Validate the registration at create time and auto-confirm free events.
 * Runs BEFORE the data is written; can throw to abort the create.
 */
export const validateRegistration: CollectionBeforeChangeHook = async ({
  data, operation, req,
}) => {
  if (operation !== 'create') return data
  if (!data.event || !data.user) return data

  const event = await req.payload.findByID({
    collection: 'events',
    id: data.event as string,
    depth: 0,
  })
  if (!event || event.isDeleted) {
    throw new APIError('Event not found', 404)
  }
  if (event.registrationOpen === false) {
    throw new APIError('Registration is closed for this event', 400)
  }
  if (event.registrationDeadline && new Date(event.registrationDeadline) < new Date()) {
    throw new APIError('Registration deadline has passed', 400)
  }
  if (
    event.maxCapacity && event.maxCapacity > 0
    && (event.registeredCount ?? 0) >= event.maxCapacity
    && !event.enableWaitlist
  ) {
    throw new APIError('Event is full', 400)
  }

  // Dedupe is enforced by the DB unique index registrations_user_event_unique.
  // A 409 surfaces as a unique-constraint error from the DB layer.

  const price = Number(event.price) || 0
  if (price <= 0) {
    // Free event — auto-confirm so the afterChange hook can issue the ticket.
    return {
      ...data,
      paymentStatus: 'not_required',
      registrationStatus: 'confirmed',
    }
  }
  return data
}

/**
 * Atomically increment event.registeredCount on the pending → confirmed
 * transition. Uses raw Drizzle to bypass the Payload Local API and ensure
 * the increment is race-free under concurrent checkouts.
 */
export const incrementOnConfirm: CollectionAfterChangeHook = async ({
  doc, previousDoc, req,
}) => {
  const wasConfirmed = previousDoc?.registrationStatus === 'confirmed'
  const isConfirmed = doc.registrationStatus === 'confirmed'
  if (isConfirmed && !wasConfirmed && doc.event) {
    try {
      const { events } = req.payload.db.tables
      await req.payload.db.drizzle
        .update(events)
        .set({ registeredCount: sql`COALESCE(${events.registeredCount}, 0) + 1` })
        .where(eq(events.id, Number(doc.event)))
    } catch (e) {
      req.payload.logger.warn(`Failed to increment registeredCount: ${e}`)
    }
  }
}

/**
 * Atomically increment event.checkedInCount on the false → true transition
 * for the registration's checkedIn flag. Called from the afterChange hook
 * chain (chained with incrementOnConfirm and sendConfirmation).
 */
export const incrementCheckedInOnTransition: CollectionAfterChangeHook = async ({
  doc, previousDoc, req,
}) => {
  if (doc.checkedIn === true && previousDoc?.checkedIn !== true && doc.event) {
    try {
      const { events } = req.payload.db.tables
      await req.payload.db.drizzle
        .update(events)
        .set({ checkedInCount: sql`COALESCE(${events.checkedInCount}, 0) + 1` })
        .where(eq(events.id, Number(doc.event)))
    } catch (e) {
      req.payload.logger.warn(`Failed to increment checkedInCount: ${e}`)
    }
  }
}

export const sendConfirmation: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (req.user?.role === 'chair') return
  if (operation !== 'create' && operation !== 'update') return
  if (doc.registrationStatus !== 'confirmed') return

  let ticketData = doc.ticket as Record<string, unknown> | null

  if (!ticketData?.ticket_id) {
    const ticketId = `TKT-${crypto.randomUUID().replace(/-/g, '').substring(0, 12).toUpperCase()}`
    let qrCode = ''
    try {
      qrCode = await generateQRBase64(ticketId)
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
