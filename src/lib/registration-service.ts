import PocketBase from 'pocketbase'
import crypto from 'crypto'
import { escapeFilterValue } from '@/lib/pb'
import { logError } from '@/lib/logger'

/**
 * Thrown by service functions when a business-rule check fails.
 * Route handlers should catch these and return the appropriate HTTP response.
 */
export class RegistrationError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
  ) {
    super(message)
    this.name = 'RegistrationError'
  }
}

// ─── Validation ───────────────────────────────────────────

/**
 * Validates that a user can register for an event.
 * Throws RegistrationError if any check fails.
 * Uses `pb` (user-context client) for reads so PB collection-level rules apply.
 */
export async function validateRegistration(
  pb: PocketBase,
  eventId: string,
  userId: string,
): Promise<{ event: Record<string, unknown>; isFree: boolean }> {
  const event = await pb.collection('events').getOne(eventId).catch(() => null)
  if (!event) throw new RegistrationError('Event not found', 404)

  // Registration must be open
  if (event.registrationOpen !== true) {
    throw new RegistrationError('Registration is not open for this event')
  }

  // Deadline check
  const deadline = event.registrationDeadline
  if (deadline && new Date() > new Date(deadline)) {
    throw new RegistrationError('Registration deadline has passed')
  }

  // Capacity check (read current counter — narrow race window is acceptable)
  const maxCapacity = event.maxCapacity
  if (maxCapacity) {
    const current = event.registeredCount || 0
    if (current >= maxCapacity) {
      throw new RegistrationError('Event has reached maximum capacity')
    }
  }

  // Duplicate check (the UNIQUE (user, event) index is the source of truth)
  const duplicates = await pb.collection('registrations').getFullList({
    filter: `user = ${escapeFilterValue(userId)} && event = ${escapeFilterValue(eventId)} && registrationStatus != "cancelled"`,
  })
  if (duplicates.length > 0) {
    throw new RegistrationError('You are already registered for this event')
  }

  const isFree = event.price === 0 || event.price === null || event.price === undefined

  return { event, isFree }
}

// ─── Ticket Generation ────────────────────────────────────

/**
 * Generates a unique ticket ID (TKT-<12-hex-chars>) and persists it.
 * Uses `adminPB` because ticket generation must always succeed.
 */
export async function generateTicketId(
  adminPB: PocketBase,
  registrationId: string,
): Promise<string> {
  const ticketId = 'TKT-' + crypto.randomBytes(6).toString('hex')
  await adminPB.collection('registrations').update(registrationId, { ticketId })
  return ticketId
}

// ─── Counter Management ───────────────────────────────────

/**
 * Increments event.registeredCount by 1.
 * Uses adminPB because regular users usually can't mutate events.
 */
export async function incrementRegisteredCount(
  adminPB: PocketBase,
  eventId: string,
): Promise<void> {
  try {
    const event = await adminPB.collection('events').getOne(eventId)
    await adminPB.collection('events').update(eventId, {
      registeredCount: Math.max(0, (event.registeredCount || 0) + 1),
    })
  } catch (err) {
    logError('increment-registered-count', err, { eventId })
  }
}

/**
 * Decrements event.registeredCount by 1 (floor 0).
 */
export async function decrementRegisteredCount(
  adminPB: PocketBase,
  eventId: string,
): Promise<void> {
  try {
    const event = await adminPB.collection('events').getOne(eventId)
    await adminPB.collection('events').update(eventId, {
      registeredCount: Math.max(0, (event.registeredCount || 0) - 1),
    })
  } catch (err) {
    logError('decrement-registered-count', err, { eventId })
  }
}

/**
 * Increments event.checkedInCount by 1.
 */
export async function incrementCheckedInCount(
  adminPB: PocketBase,
  eventId: string,
): Promise<void> {
  try {
    const event = await adminPB.collection('events').getOne(eventId)
    await adminPB.collection('events').update(eventId, {
      checkedInCount: Math.max(0, (event.checkedInCount || 0) + 1),
    })
  } catch (err) {
    logError('increment-checkedin-count', err, { eventId })
  }
}

// ─── Registration Creation ─────────────────────────────────

export async function createRegistration(
  pb: PocketBase,
  adminPB: PocketBase,
  data: {
    userId: string
    eventId: string
    userName: string
    userEmail: string
    userPhone: string
    formResponses: Record<string, unknown>
  },
): Promise<{
  registrationId: string
  ticketId: string
  paymentRequired: boolean
  amount: number
}> {
  const { userId, eventId, userName, userEmail, userPhone, formResponses } = data

  // 1. Validate
  const { event, isFree } = await validateRegistration(pb, eventId, userId)

  // 2. Create the registration record
  const now = new Date().toISOString()
  const registration = await pb.collection('registrations').create({
    user: userId,
    event: eventId,
    userName,
    userEmail,
    userPhone,
    formResponses,
    registrationDate: now,
    paymentStatus: isFree ? 'not_required' : 'pending',
    registrationStatus: isFree ? 'confirmed' : 'pending',
    amount: isFree ? 0 : (Number(event.price) || 0),
  })

  // 3. Post-processing
  if (isFree) {
    const ticketId = await generateTicketId(adminPB, registration.id)
    await incrementRegisteredCount(adminPB, eventId)
    return { registrationId: registration.id, ticketId, paymentRequired: false, amount: 0 }
  }

  // Paid — generate a payment ticket ID
  const paymentTicketId = crypto.randomUUID()
  await adminPB.collection('registrations').update(registration.id, { paymentTicketId })

  return {
    registrationId: registration.id,
    ticketId: paymentTicketId,
    paymentRequired: true,
    amount: Number(event.price) || 0,
  }
}

/**
 * Called after payment confirms: sets status, generates ticket, bumps counter.
 */
export async function confirmRegistration(
  adminPB: PocketBase,
  registrationId: string,
): Promise<void> {
  const reg = await adminPB.collection('registrations').getOne(registrationId).catch(() => null)
  if (!reg) throw new RegistrationError('Registration not found', 404)

  const wasConfirmed = reg.registrationStatus === 'confirmed'

  // Update status (nop if already confirmed)
  await adminPB.collection('registrations').update(registrationId, {
    registrationStatus: 'confirmed',
  })

  // Generate ticket if missing
  if (!reg.ticketId) {
    await generateTicketId(adminPB, registrationId)
  }

  // Bump counter (only if this is a fresh confirmation)
  if (!wasConfirmed && reg.event) {
    await incrementRegisteredCount(adminPB, reg.event)
  }
}

/**
 * Cancels a registration and decrements the event counter if it was confirmed.
 */
export async function cancelRegistration(
  adminPB: PocketBase,
  registrationId: string,
): Promise<void> {
  const reg = await adminPB.collection('registrations').getOne(registrationId).catch(() => null)
  if (!reg) throw new RegistrationError('Registration not found', 404)

  const wasConfirmed = reg.registrationStatus === 'confirmed'

  await adminPB.collection('registrations').update(registrationId, {
    registrationStatus: 'cancelled',
  })

  if (wasConfirmed && reg.event) {
    await decrementRegisteredCount(adminPB, reg.event)
  }
}

/**
 * Marks a registration as checked in and bumps the event's checkedInCount.
 */
export async function checkInRegistration(
  adminPB: PocketBase,
  registrationId: string,
): Promise<void> {
  const reg = await adminPB.collection('registrations').getOne(registrationId).catch(() => null)
  if (!reg) throw new RegistrationError('Registration not found', 404)
  if (reg.checkedIn) return // idempotent

  const now = new Date().toISOString()
  await adminPB.collection('registrations').update(registrationId, {
    checkedIn: true,
    checkedInAt: now,
  })

  if (reg.event) {
    await incrementCheckedInCount(adminPB, reg.event)
  }
}

/**
 * Soft-deletes an event: marks as deleted, closes registration, sets status.
 */
export async function softDeleteEvent(
  adminPB: PocketBase,
  eventId: string,
): Promise<void> {
  await adminPB.collection('events').update(eventId, {
    isDeleted: true,
    status: 'completed',
    registrationOpen: false,
  })
}
