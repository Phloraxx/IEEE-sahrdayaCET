import { NextRequest } from 'next/server'
import { createPB, createAdminPB } from '@/lib/pb'
import { requireAuth } from '@/lib/auth'
import { handleError } from '@/lib/api-error'
import { validateCouponCode, computeDiscount } from '@/lib/registration-service'

export async function POST(req: NextRequest) {
  try {
    const pb = createPB(req.headers.get('cookie') || undefined)
    await requireAuth(pb)
    const adminPB = createAdminPB()

    const body = await req.json()
    const { eventId, code } = body

    if (!eventId || !code) {
      return Response.json({ error: 'eventId and code are required' }, { status: 400 })
    }

    const { coupon, event } = await validateCouponCode(adminPB, eventId, code)

    const price = Number(event.price) || 0
    const discountAmount = computeDiscount(price, coupon)
    const finalPrice = Math.max(0, price - discountAmount)

    return Response.json({
      valid: true,
      coupon: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount,
        finalPrice,
      },
    })
  } catch (error) {
    return handleError(error, 'validate-coupon')
  }
}
