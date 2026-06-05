import type { Payload } from 'payload'
import { APIError } from 'payload'

/**
 * Look up a coupon by code, validate it for the given event, compute the
 * discounted amount, and increment the coupon's usedCount. Throws APIError
 * on any validation failure so the caller can return the same shape.
 */
export async function applyCoupon(
  payload: Payload,
  code: string,
  eventId: string,
  basePrice: number,
): Promise<{ coupon: { id: string | number }; discountedAmount: number }> {
  const { docs } = await payload.find({
    collection: 'coupons',
    where: { code: { equals: code } },
    depth: 0,
    limit: 1,
  })
  if (docs.length === 0) {
    throw new APIError('Invalid coupon code', 400)
  }

  const coupon = docs[0] as {
    id: string | number
    isActive?: boolean
    expiresAt?: string
    maxUses?: number
    usedCount?: number
    event?: unknown
    discountType: 'percentage' | 'fixed'
    discountValue: number
  }

  if (!coupon.isActive) {
    throw new APIError('Coupon is inactive', 400)
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    throw new APIError('Coupon has expired', 400)
  }
  if (coupon.maxUses && (coupon.usedCount ?? 0) >= coupon.maxUses) {
    throw new APIError('Coupon usage limit reached', 400)
  }

  const couponEventId = coupon.event
    ? (typeof coupon.event === 'object'
      ? String((coupon.event as { id: unknown }).id)
      : String(coupon.event))
    : ''
  if (couponEventId && couponEventId !== String(eventId)) {
    throw new APIError('Coupon not valid for this event', 400)
  }

  const discounted = coupon.discountType === 'percentage'
    ? basePrice - (basePrice * Number(coupon.discountValue)) / 100
    : basePrice - Number(coupon.discountValue)

  const finalAmount = Math.max(0, discounted)

  try {
    await payload.update({
      collection: 'coupons',
      id: coupon.id,
      data: { usedCount: (coupon.usedCount ?? 0) + 1 },
    })
  } catch {
    payload.logger.warn('Failed to update coupon usedCount')
  }

  return { coupon: { id: coupon.id }, discountedAmount: finalAmount }
}
