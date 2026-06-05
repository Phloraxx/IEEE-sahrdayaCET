import { describe, it, expect, vi } from 'vitest'
import { APIError } from 'payload'
import { applyCoupon } from '@/lib/coupons'

type Coupon = {
  id: string | number
  code: string
  isActive?: boolean
  expiresAt?: string
  maxUses?: number
  usedCount?: number
  event?: unknown
  discountType: 'percentage' | 'fixed'
  discountValue: number
}

function makePayload(coupons: Coupon[]) {
  return {
    find: vi.fn(async () => ({ docs: coupons, totalDocs: coupons.length })),
    update: vi.fn(async () => ({})),
    logger: { warn: vi.fn() },
  }
}

const active = {
  id: 1,
  code: 'WELCOME',
  isActive: true,
  discountType: 'percentage' as const,
  discountValue: 20,
}

describe('applyCoupon', () => {
  it('throws 400 on invalid code', async () => {
    const payload = makePayload([])
    await expect(
      applyCoupon(payload as never, 'NOPE', 'evt-1', 100),
    ).rejects.toBeInstanceOf(APIError)
  })

  it('throws 400 when coupon is inactive', async () => {
    const payload = makePayload([{ ...active, isActive: false }])
    await expect(
      applyCoupon(payload as never, 'WELCOME', 'evt-1', 100),
    ).rejects.toThrow(/inactive/i)
  })

  it('throws 400 when coupon is expired', async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString()
    const payload = makePayload([{ ...active, expiresAt: past }])
    await expect(
      applyCoupon(payload as never, 'WELCOME', 'evt-1', 100),
    ).rejects.toThrow(/expired/i)
  })

  it('throws 400 when max uses reached', async () => {
    const payload = makePayload([{ ...active, maxUses: 5, usedCount: 5 }])
    await expect(
      applyCoupon(payload as never, 'WELCOME', 'evt-1', 100),
    ).rejects.toThrow(/limit/i)
  })

  it('throws 400 when coupon is for a different event', async () => {
    const payload = makePayload([{ ...active, event: 'evt-2' }])
    await expect(
      applyCoupon(payload as never, 'WELCOME', 'evt-1', 100),
    ).rejects.toThrow(/not valid/i)
  })

  it('computes percentage discount', async () => {
    const payload = makePayload([active])
    const { discountedAmount } = await applyCoupon(payload as never, 'WELCOME', 'evt-1', 100)
    expect(discountedAmount).toBe(80)
    expect(payload.update).toHaveBeenCalled()
  })

  it('computes fixed discount and floors at 0', async () => {
    const payload = makePayload([{ ...active, discountType: 'fixed', discountValue: 50 }])
    const r1 = await applyCoupon(payload as never, 'WELCOME', 'evt-1', 100)
    expect(r1.discountedAmount).toBe(50)

    const payload2 = makePayload([{ ...active, discountType: 'fixed', discountValue: 200 }])
    const r2 = await applyCoupon(payload2 as never, 'WELCOME', 'evt-1', 100)
    expect(r2.discountedAmount).toBe(0)
  })

  it('increments usedCount on success', async () => {
    const payload = makePayload([{ ...active, usedCount: 2 }])
    await applyCoupon(payload as never, 'WELCOME', 'evt-1', 100)
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'coupons',
        data: expect.objectContaining({ usedCount: 3 }),
      }),
    )
  })
})
