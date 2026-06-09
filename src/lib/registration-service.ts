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

// ─── Coupon Validation ─────────────────────────────────────

/**
 * Validates a coupon code against the event's stored coupons.
 * If valid, applies the discount and increments usedCount.
 * Returns the discount amount and final price, or throws if invalid.
 */
export async function validateAndApplyCoupon(
  adminPB: PocketBase,
  eventId: string,
  code: string,
): Promise<{ discountAmount: number; finalPrice: number }> {
  const event = await adminPB.collection('events').getOne(eventId).catch(() => null)
  if (!event) throw new RegistrationError('Event not found', 404)

  const coupons = (event as Record<string, unknown>).coupons as unknown[] | undefined
  if (!coupons || !Array.isArray(coupons) || coupons.length === 0) {
    throw new RegistrationError('Invalid coupon code')
  }

  const coupon = coupons.find(
    (c: any) => typeof c === 'object' && c.code?.toUpperCase() === code.toUpperCase(),
  ) as Record<string, unknown> | undefined

  if (!coupon) throw new RegistrationError('Invalid coupon code')

  if (coupon.isActive === false) {
    throw new RegistrationError('This coupon is no longer active')
  }

  if (coupon.expiresAt && new Date(coupon.expiresAt as string) < new Date()) {
    throw new RegistrationError('This coupon has expired')
  }

  const maxUses = Number(coupon.maxUses) || 0
  const usedCount = Number(coupon.usedCount) || 0
  if (maxUses > 0 && usedCount >= maxUses) {
    throw new RegistrationError('This coupon has reached its maximum uses')
  }

  const price = Number((event as Record<string, unknown>).price) || 0
  const discountType = coupon.discountType as string
  const discountValue = Number(coupon.discountValue) || 0

  let discountAmount = 0
  if (discountType === 'percentage') {
    discountAmount = Math.round(price * (discountValue / 100))
  } else {
    discountAmount = Math.min(discountValue, price)
  }

  const finalPrice = Math.max(0, price - discountAmount)

  // Increment usedCount on the coupon
  const updatedCoupons = coupons.map((c: any) => {
    if (c.code?.toUpperCase() === code.toUpperCase()) {
      return { ...c, usedCount: (c.usedCount || 0) + 1 }
    }
    return c
  })

  await adminPB.collection('events').update(eventId, { coupons: updatedCoupons })

  return { discountAmount, finalPrice }
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
    couponCode?: string
  },
): Promise<{
  registrationId: string
  ticketId: string
  paymentRequired: boolean
  amount: number
}> {
  const { userId, eventId, userName, userEmail, userPhone, formResponses, couponCode } = data

  // 1. Validate
  const { event, isFree } = await validateRegistration(pb, eventId, userId)

  // 2. Validate required custom fields
  const formTemplate = (event as Record<string, unknown>).formTemplate
  if (Array.isArray(formTemplate)) {
    for (const field of formTemplate as Array<Record<string, unknown>>) {
      if (field.required) {
        const val = formResponses[field.id as string]
        if (val === undefined || val === null || val === '') {
          throw new RegistrationError(`"${(field.label as string) || 'A required field'}" is required`)
        }
      }
    }
  }

  let finalAmount = isFree ? 0 : (Number(event.price) || 0)
  let discountAmount = 0

  // 2. Apply coupon if provided
  if (couponCode && !isFree) {
    const couponResult = await validateAndApplyCoupon(adminPB, eventId, couponCode)
    finalAmount = couponResult.finalPrice
    discountAmount = couponResult.discountAmount
  }

  // 3. Create the registration record
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
    amount: finalAmount,
    couponCode: couponCode || '',
    discountAmount,
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
    amount: finalAmount,
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
