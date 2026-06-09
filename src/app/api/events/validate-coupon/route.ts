import { NextRequest } from 'next/server'
import { createPB } from '@/lib/pb'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { eventId, code } = body

    if (!eventId || !code) {
      return Response.json({ error: 'eventId and code are required' }, { status: 400 })
    }

    const pb = createPB()
    const event = await pb.collection('events').getOne(eventId)

    const coupons = (event as Record<string, unknown>).coupons as unknown[] | undefined
    if (!coupons || !Array.isArray(coupons) || coupons.length === 0) {
      return Response.json({ error: 'Invalid coupon code' }, { status: 404 })
    }

    const coupon = coupons.find(
      (c: any) => c.code?.toUpperCase() === code.toUpperCase()
    ) as Record<string, unknown> | undefined

    if (!coupon) {
      return Response.json({ error: 'Invalid coupon code' }, { status: 404 })
    }

    if (!coupon.isActive) {
      return Response.json({ error: 'This coupon is no longer active' }, { status: 400 })
    }

    if (coupon.expiresAt && new Date(coupon.expiresAt as string) < new Date()) {
      return Response.json({ error: 'This coupon has expired' }, { status: 400 })
    }

    const maxUses = Number(coupon.maxUses) || 0
    const usedCount = Number(coupon.usedCount) || 0
    if (maxUses > 0 && usedCount >= maxUses) {
      return Response.json({ error: 'This coupon has reached its maximum uses' }, { status: 400 })
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

    return Response.json({
      valid: true,
      coupon: {
        code: coupon.code,
        discountType,
        discountValue,
        discountAmount,
        finalPrice,
      },
    })
  } catch (error) {
    return Response.json({ error: 'Failed to validate coupon' }, { status: 500 })
  }
}
