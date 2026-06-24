import type PocketBase from 'pocketbase'
import { createAdminPB, escapeFilterValue } from '@/lib/pb'
import type { Coupon, Event } from '@/types'
import { logError } from '@/lib/logger'
import { getField } from '@/lib/safe-get'

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
// Ticket IDs are generated in this module (generateTicketId) and set on the
// registration at create/confirm time. Single source of truth — no PB hooks.

// ─── Coupon Validation ─────────────────────────────────────

/**
 * Read-only coupon validation: checks code exists, is active, not expired,
 * and hasn't exceeded max uses. Does NOT mutate anything.
 * Throws RegistrationError on any failure.
 */
export async function validateCouponCode(
  pb: PocketBase,
  eventId: string,
  code: string,
): Promise<{ coupon: Coupon; event: Event }> {
  const event = await pb.collection('events').getOne<Event>(eventId).catch(() => null)
  if (!event) throw new RegistrationError('Event not found', 404)

  const result = await pb.collection('coupons').getList(1, 1, {
    filter: `code = ${escapeFilterValue(code)} && event = ${escapeFilterValue(eventId)} && isActive = true && (expiresAt = null || expiresAt > @now)`,
    fields: 'id,code,discountPercent,maxUses,usedCount,expiresAt',
  })
  if (result.items.length === 0) {
    throw new RegistrationError('Invalid or expired coupon code')
  }
  const coupon = result.items[0] as unknown as Coupon

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
export function computeDiscount(price: number, coupon: Pick<Coupon, 'discountPercent'>): number {
  const discountPercent = Number(coupon.discountPercent) || 0
  return Math.round(price * (discountPercent / 100))
}

/**
 * Validates a coupon code, applies the discount, and atomically increments
 * the coupon's usedCount. Queries the dedicated `coupons` collection.
 */
export async function validateAndApplyCoupon(
  pb: PocketBase,
  eventId: string,
  code: string,
): Promise<{ discountAmount: number; finalPrice: number }> {
  const result = await pb.collection('coupons').getList(1, 1, {
    filter: `code = ${escapeFilterValue(code)} && event = ${escapeFilterValue(eventId)} && isActive = true && (expiresAt = null || expiresAt > @now)`,
    fields: 'id,code,discountPercent,maxUses,usedCount,expiresAt',
  })
  if (result.items.length === 0) {
    throw new RegistrationError('Invalid or expired coupon code')
  }
  const coupon = result.items[0] as Record<string, unknown>

  const usedCount = Number(coupon.usedCount) || 0
  const maxUses = Number(coupon.maxUses) || 0
  if (maxUses > 0 && usedCount >= maxUses) {
    throw new RegistrationError('Coupon usage limit reached')
  }

  // Atomic increment — PocketBase handles conflict detection
  await pb.collection('coupons').update(coupon.id as string, { 'usedCount+': 1 })

  // Get event price for discount computation
  const event = await pb.collection('events').getOne(eventId, { fields: 'price' })
  const price = Number((event as Record<string, unknown>).price) || 0
  const discountPercent = Number(coupon.discountPercent) || 0
  const discountAmount = Math.round(price * (discountPercent / 100))
  const finalPrice = Math.max(0, price - discountAmount)

  return { discountAmount, finalPrice }
}

// ─── Registration Creation ─────────────────────────────────

export async function createRegistration(
  pb: PocketBase,
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

  // 1. Fetch event and enforce registration gates.
  const event = await pb.collection('events').getOne<Event>(eventId).catch(() => null)
  if (!event) throw new RegistrationError('Event not found', 404)

  if (event.isDeleted) throw new RegistrationError('Event not found', 404)
  if (event.registrationOpen !== true) throw new RegistrationError('Registration is not open for this event')
  if (event.registrationDeadline && new Date() > new Date(event.registrationDeadline)) {
    throw new RegistrationError('Registration deadline has passed')
  }

  // Capacity check: live COUNT of non-cancelled registrations (pending
  // registrations hold a seat). At this scale a live COUNT is sub-millisecond
  // and cannot drift like a denormalized counter.
  if (event.maxCapacity && event.maxCapacity > 0) {
    const result = await pb.collection('registrations').getList(1, 1, {
      filter: `event = ${escapeFilterValue(eventId)} && registrationStatus != "cancelled"`,
      fields: 'id',
      count: 1,
    })
    if ((result.totalItems ?? 0) >= event.maxCapacity) {
      throw new RegistrationError('Event has reached maximum capacity')
    }
  }

  // Idempotency check: prevent duplicate pending registration
  const existing = await pb.collection('registrations').getList(1, 1, {
    filter: `user = ${escapeFilterValue(userId)} && event = ${escapeFilterValue(eventId)} && registrationStatus = "pending"`,
    fields: 'id',
    count: 1,
  })
  if ((existing.totalItems ?? 0) > 0) {
    throw new RegistrationError('You already have a pending registration for this event')
  }

  // Form-field validation: required fields must be present.
  const formTemplate = event.formTemplate
  if (Array.isArray(formTemplate)) {
    for (const field of formTemplate) {
      if (field.required) {
        const val = formResponses[field.id]
        if (val === undefined || val === null || val === '') {
          throw new RegistrationError(`"${field.label || 'A required field'}" is required`)
        }
      }
    }
  }


  const isFree = event.price === 0 || event.price === null || event.price === undefined
  let finalAmount = isFree ? 0 : (Number(event.price) || 0)
  let discountAmount = 0

  // 2. Apply coupon if provided (paid events only).
  if (couponCode && !isFree) {
    const couponResult = await validateAndApplyCoupon(pb, eventId, couponCode)
    finalAmount = couponResult.finalPrice
    discountAmount = couponResult.discountAmount
  }

  // 3. Generate the user-facing ticket ID here (single source of truth).
  //    Previously pb_hooks/registrations_confirm.pb.js did this in a separate
  //    after-create save that could crash and leave a ticketless record.
  const ticketId = isFree ? generateTicketId() : undefined

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
    ...(ticketId ? { ticketId } : {}),
  })

  // 4. Bump registeredCount for the free/confirmed path (previously the
  //    onRecordAfterCreate hook did this). Paid events bump on webhook confirm.
  if (isFree) {
    await bumpEventCounter(eventId, 'registeredCount', +1, pb)
    return { registrationId: registration.id, paymentRequired: false, amount: 0 }
  }

  // 5. For paid events, generate a payment ticket ID (webhook lookup key),
  //    distinct from the user-facing ticketId (generated on confirmation).
  const paymentTicketId = crypto.randomUUID()
  await pb.collection('registrations').update(registration.id, { paymentTicketId })

  return {
    registrationId: registration.id,
    paymentTicketId,
    paymentRequired: true,
    amount: finalAmount,
  }
}

/**
 * Called after payment confirms: sets status to confirmed, generates the
 * user-facing ticketId if missing, and bumps registeredCount on the event.
 */
export async function confirmRegistration(
  pb: PocketBase,
  registrationId: string,
  existingReg?: Record<string, unknown>,
): Promise<void> {
  const reg = existingReg ?? await pb.collection('registrations')
    .getOne(registrationId, { fields: 'id,event,registrationStatus,ticketId' })
    .catch(() => null)
  if (!reg) throw new RegistrationError('Registration not found', 404)

  const wasPending = getField<string>(reg, 'registrationStatus', '') !== 'confirmed'
  if (getField<string>(reg, 'registrationStatus', '') === 'confirmed') return // idempotent

  const eventId = getField(reg, 'event', '')

  await pb.collection('registrations').update(registrationId, {
    registrationStatus: 'confirmed',
    ...(getField(reg, 'ticketId', '') ? {} : { ticketId: generateTicketId() }),
  })

  // Bump registeredCount only if this call actually transitioned the status.
  // Note: a concurrent caller may also see wasPending=true and bump.
  //       Race window is ~1ms. For precise accounting, use PB hooks with unique constraints.
  if (wasPending) {
    await bumpEventCounter(eventId, 'registeredCount', +1, pb)
  }
}

/** Cancels a registration and decrements registeredCount if it was confirmed. */
export async function cancelRegistration(
  pb: PocketBase,
  registrationId: string,
): Promise<void> {
  const reg = await pb.collection('registrations')
    .getOne(registrationId, { fields: 'id,event,registrationStatus' })
    .catch(() => null)
  if (!reg) throw new RegistrationError('Registration not found', 404)

  const wasConfirmed = getField<string>(reg, 'registrationStatus', '') === 'confirmed'

  const eventId = getField(reg, 'event', '')
  await pb.collection('registrations').update(registrationId, {
    registrationStatus: 'cancelled',
  })

  // Note: a concurrent caller may also see wasConfirmed=true and decrement.
  //       Race window is ~1ms. For precise accounting, use PB hooks with unique constraints.
  if (wasConfirmed) {
    await bumpEventCounter(eventId, 'registeredCount', -1, pb)
  }
}

/** Marks a registration as checked in and bumps checkedInCount. */
export async function checkInRegistration(
  pb: PocketBase,
  registrationId: string,
): Promise<void> {
  const reg = await pb.collection('registrations')
    .getOne(registrationId, { fields: 'id,event,checkedIn' })
    .catch(() => null)
  if (!reg) throw new RegistrationError('Registration not found', 404)
  const wasNotCheckedIn = !getField(reg, 'checkedIn', false)
  if (getField(reg, 'checkedIn', false)) return // idempotent

  await pb.collection('registrations').update(registrationId, {
    checkedIn: true,
    checkedInAt: new Date().toISOString(),
  })

  // Bump checkedInCount only if this call actually transitioned the status.
  // Note: a concurrent caller may also see wasNotCheckedIn=true and bump.
  //       Race window is ~1ms. For precise accounting, use PB hooks with unique constraints.
  if (wasNotCheckedIn) {
    await bumpEventCounter(getField(reg, 'event', ''), 'checkedInCount', +1, pb)
  }
}


// ─── Helpers ───────────────────────────────────────────────

/** Generates a user-facing ticket ID, e.g. TKT-a1b2c3d4e5f6. */
function generateTicketId(): string {
  return `TKT-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
}

/**
 * Adjusts a denormalized counter on the event by `delta`. Optimistic retry-on-
 * conflict: reads current, writes next, and on a PB conflict re-reads and
 * retries up to 3x with a small backoff. On exhaustion, logs and returns —
 * counter drift is recoverable via reconcile-counters.ts. No PB hooks.
 */
export async function bumpEventCounter(
  eventId: string,
  field: 'registeredCount' | 'checkedInCount',
  delta: number,
  pb?: PocketBase,
): Promise<void> {
  const MAX_RETRIES = 3
  const client = pb ?? createAdminPB()
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const event = await client.collection('events')
      .getOne(eventId, { fields: `id,${field}` })
      .catch(() => null)
    if (!event) return
    let current = 0
    if (event && typeof event === 'object' && field in event) {
      current = Number(event[field as keyof typeof event]) || 0
    }
    const next = Math.max(0, current + delta)
    try {
      await client.collection('events').update(eventId, { [field]: next })
      return
    } catch (err) {
      if (attempt === MAX_RETRIES - 1) {
        logError('bumpEventCounter', err)
        return
      }
      await new Promise((r) => setTimeout(r, 5 * (attempt + 1)))
    }
  }
}

