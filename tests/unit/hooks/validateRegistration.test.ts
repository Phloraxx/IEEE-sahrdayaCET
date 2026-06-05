import { describe, it, expect, vi, beforeEach } from 'vitest'
import { APIError } from 'payload'
import { validateRegistration } from '@/payload/hooks/registrations'

type Event = {
  id: string
  isDeleted?: boolean
  registrationOpen?: boolean
  registrationDeadline?: string
  maxCapacity?: number
  registeredCount?: number
  enableWaitlist?: boolean
  price: number
}

type HookArgs = Parameters<typeof validateRegistration>[0]

function makeReq(events: Event[]) {
  return {
    payload: {
      findByID: vi.fn(async ({ id }: { id: string }) => {
        return events.find((e) => e.id === id) ?? null
      }),
    },
  }
}

const userBase = { id: 1 } as never

const baseData = {
  user: userBase,
  event: 'evt-1',
  userName: 'Test',
  userEmail: 't@example.com',
  formResponses: {},
} as never

describe('validateRegistration', () => {
  it('passes through on update (not create)', async () => {
    const req = makeReq([])
    const result = await validateRegistration({
      data: baseData, operation: 'update', req: req as never,
    } as HookArgs)
    expect(result).toBe(baseData)
  })

  it('throws 404 when event is missing', async () => {
    const req = makeReq([])
    await expect(
      validateRegistration({
        data: { ...baseData, event: 'ghost' },
        operation: 'create',
        req: req as never,
      } as HookArgs),
    ).rejects.toThrow(APIError)
  })

  it('throws 404 when event is soft-deleted', async () => {
    const req = makeReq([{ id: 'evt-1', isDeleted: true, price: 0 }])
    await expect(
      validateRegistration({
        data: baseData, operation: 'create', req: req as never,
      } as HookArgs),
    ).rejects.toThrow(/not found/i)
  })

  it('throws 400 when registration is closed', async () => {
    const req = makeReq([{ id: 'evt-1', registrationOpen: false, price: 0 }])
    await expect(
      validateRegistration({
        data: baseData, operation: 'create', req: req as never,
      } as HookArgs),
    ).rejects.toThrow(/closed/i)
  })

  it('throws 400 when deadline has passed', async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString()
    const req = makeReq([{ id: 'evt-1', registrationDeadline: past, price: 0 }])
    await expect(
      validateRegistration({
        data: baseData, operation: 'create', req: req as never,
      } as HookArgs),
    ).rejects.toThrow(/deadline/i)
  })

  it('throws 400 when full and waitlist disabled', async () => {
    const req = makeReq([{ id: 'evt-1', maxCapacity: 10, registeredCount: 10, enableWaitlist: false, price: 0 }])
    await expect(
      validateRegistration({
        data: baseData, operation: 'create', req: req as never,
      } as HookArgs),
    ).rejects.toThrow(/full/i)
  })

  it('does NOT throw when full but waitlist enabled', async () => {
    const req = makeReq([{ id: 'evt-1', maxCapacity: 10, registeredCount: 10, enableWaitlist: true, price: 0 }])
    const result = await validateRegistration({
      data: baseData, operation: 'create', req: req as never,
    } as HookArgs)
    // Free event, so the result gets auto-confirmed (see next test)
    expect(result).toMatchObject({ paymentStatus: 'not_required', registrationStatus: 'confirmed' })
  })

  it('auto-confirms free events (price === 0)', async () => {
    const req = makeReq([{ id: 'evt-1', price: 0 }])
    const result = await validateRegistration({
      data: baseData, operation: 'create', req: req as never,
    } as HookArgs)
    expect(result).toMatchObject({
      paymentStatus: 'not_required',
      registrationStatus: 'confirmed',
    })
  })

  it('leaves paid events in pending state', async () => {
    const req = makeReq([{ id: 'evt-1', price: 100 }])
    const result = await validateRegistration({
      data: baseData, operation: 'create', req: req as never,
    } as HookArgs)
    expect(result).toBe(baseData)
  })
})
