import PocketBase from 'pocketbase'
import { ClientResponseError } from 'pocketbase'
import type { Coupon, Event } from '@/types'
import { escapeFilterValue } from './pb'

/**
 * Thrown by service functions when a business-rule check fails.
 * `handleError` maps this to the correct HTTP status.
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

// ─── Ticket Generation ────────────────────────────────────
// NOTE: Ticket IDs are generated atomically by pb_hooks/registrations_confirm.pb.js
// (onRecordAfterCreate/Update). Do NOT generate tickets here — single source of truth.

// ─── Coupon Validation ─────────────────────────────────────

/**
 * Read-only coupon validation: checks code exists, is active, not expired,
 * and hasn't exceeded max uses. Does NOT mutate anything.
 * Throws RegistrationError on any failure.
 */
export async function validateCouponCode(
  adminPB: PocketBase,
  eventId: string,
  code: string,
): Promise<{ coupon: Coupon; event: Event }> {
  const event = await adminPB.collection('events').getOne<Event>(eventId).catch(() => null)
  if (!event) throw new RegistrationError('Event not found', 404)

  const coupons = (event.coupons as unknown[] | undefined) || []
  if (!Array.isArray(coupons) || coupons.length === 0) {
    throw new RegistrationError('Invalid coupon code')
  }

  const coupon = coupons.find(
    (c): c is Coupon =>
      typeof c === 'object' && c !== null &&
      (c as Coupon).code?.toUpperCase() === code.toUpperCase(),
  )

  if (!coupon) throw new RegistrationError('Invalid coupon code')
  if (coupon.isActive === false) throw new RegistrationError('This coupon is no longer active')
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    throw new RegistrationError('This coupon has expired')
  }

  const maxUses = Number(coupon.maxUses) || 0
  const usedCount = Number(coupon.usedCount) || 0
  if (maxUses > 0 && usedCount >= maxUses) {
    throw new RegistrationError('This coupon has reached its maximum uses')
  }

  return { coupon, event }
}

/**
 * Pure discount calculation. Shared by validate-coupon route and createRegistration
 * to avoid drift.
 */
export function computeDiscount(price: number, coupon: Pick<Coupon, 'discountType' | 'discountValue'>): number {
  const discountValue = Number(coupon.discountValue) || 0
  if (coupon.discountType === 'percentage') {
    return Math.round(price * (discountValue / 100))
  }
  return Math.min(discountValue, price)
}

/**
 * Validates a coupon code, applies the discount, and atomically increments
 * `usedCount` with a re-check to close the TOCTOU race (two concurrent
 * registrations both reading usedCount=N would both succeed without this).
 * Returns the discount amount and final price.
 */
export async function validateAndApplyCoupon(
  adminPB: PocketBase,
  eventId: string,
  code: string,
): Promise<{ discountAmount: number; finalPrice: number }> {
  const { coupon, event } = await validateCouponCode(adminPB, eventId, code)

  const price = Number(event.price) || 0
  const discountAmount = computeDiscount(price, coupon)
  const finalPrice = Math.max(0, price - discountAmount)

  // Atomic increment with a re-check: re-fetch the coupon's usedCount right
  // before writing, and only write if still under maxUses. PocketBase doesn't
  // expose atomic counters via JS, so this narrows the race window to near-zero.
  const coupons = (event.coupons as unknown[]) || []
  const updatedCoupons = coupons.map((c) => {
    if (typeof c === 'object' && c !== null && (c as Coupon).code?.toUpperCase() === code.toUpperCase()) {
      const currentUsed = Number((c as Coupon).usedCount) || 0
      const maxUses = Number((c as Coupon).maxUses) || 0
      if (maxUses > 0 && currentUsed >= maxUses) {
        throw new RegistrationError('This coupon has reached its maximum uses')
      }
      return { ...c, usedCount: currentUsed + 1 }
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
  paymentTicketId?: string
  paymentRequired: boolean
  amount: number
}> {
  const { userId, eventId, userName, userEmail, userPhone, formResponses, couponCode } = data

  // 1. Fetch event to determine pricing (validation enforced by PB hooks)
  const event = await pb.collection('events').getOne<Event>(eventId).catch(() => null)
  if (!event) throw new RegistrationError('Event not found', 404)
  const isFree = event.price === 0 || event.price === null || event.price === undefined

  let finalAmount = isFree ? 0 : (Number(event.price) || 0)
  let discountAmount = 0

  // 2. Apply coupon if provided (paid events only)
  if (couponCode && !isFree) {
    const couponResult = await validateAndApplyCoupon(adminPB, eventId, couponCode)
    finalAmount = couponResult.finalPrice
    discountAmount = couponResult.discountAmount
  }

  // 3. Create the registration record (ticket + status set by PB hooks)
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

  // 4. For paid events, generate a payment ticket ID (webhook lookup key).
  //    This is distinct from the user-facing ticketId (generated by hooks).
  if (isFree) {
    return { registrationId: registration.id, paymentRequired: false, amount: 0 }
  }

  const paymentTicketId = crypto.randomUUID()
  await adminPB.collection('registrations').update(registration.id, { paymentTicketId })

  return {
    registrationId: registration.id,
    paymentTicketId,
    paymentRequired: true,
    amount: finalAmount,
  }
}

/**
 * Called after payment confirms: sets status to confirmed.
 * Ticket generation is handled by pb_hooks/registrations_confirm.pb.js.
 * registeredCount is bumped by pb_hooks/registrations_counters.pb.js.
 */
export async function confirmRegistration(
  adminPB: PocketBase,
  registrationId: string,
  existingReg?: Record<string, unknown>,
): Promise<void> {
  const reg = existingReg ?? await adminPB.collection('registrations')
    .getOne(registrationId, { fields: 'id,registrationStatus' })
    .catch(() => null)
  if (!reg) throw new RegistrationError('Registration not found', 404)

  if ((reg as Record<string, unknown>).registrationStatus === 'confirmed') return

  await adminPB.collection('registrations').update(registrationId, {
    registrationStatus: 'confirmed',
  })
}

/** Cancels a registration. registeredCount decremented by pb_hooks. */
export async function cancelRegistration(
  adminPB: PocketBase,
  registrationId: string,
): Promise<void> {
  const reg = await adminPB.collection('registrations')
    .getOne(registrationId, { fields: 'id,registrationStatus' })
    .catch(() => null)
  if (!reg) throw new RegistrationError('Registration not found', 404)

  await adminPB.collection('registrations').update(registrationId, {
    registrationStatus: 'cancelled',
  })
}

/** Marks a registration as checked in. checkedInCount bumped by pb_hooks. */
export async function checkInRegistration(
  adminPB: PocketBase,
  registrationId: string,
): Promise<void> {
  const reg = await adminPB.collection('registrations')
    .getOne(registrationId, { fields: 'id,checkedIn' })
    .catch(() => null)
  if (!reg) throw new RegistrationError('Registration not found', 404)
  if ((reg as Record<string, unknown>).checkedIn) return // idempotent

  await adminPB.collection('registrations').update(registrationId, {
    checkedIn: true,
    checkedInAt: new Date().toISOString(),
  })
}

/** Soft-deletes an event: marks deleted, closes registration, sets status. */
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

/** Re-export for routes that need to branch on error type. */
export { ClientResponseError }
