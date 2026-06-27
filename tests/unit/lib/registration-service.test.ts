import { describe, it, expect, vi, type Mock } from 'vitest'
import type PocketBase from 'pocketbase'
import {
  RegistrationError,
  createRegistration,
  confirmRegistration,
  cancelRegistration,
  checkInRegistration,
} from '@/lib/registration-service'

// bumpEventCounter now self-elevates via createAdminPB(), so we mock it
const { mockEventsUpdateForAdmin } = vi.hoisted(() => ({
  mockEventsUpdateForAdmin: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/lib/pb', () => ({
  escapeFilterValue: (v: string | number | boolean) => {
    if (typeof v === 'number') return String(v)
    if (typeof v === 'boolean') return v ? 'true' : 'false'
    return `'${String(v).replace(/'/g, "''")}'`
  },
  createAdminPB: () => ({
    collection: vi.fn((name: string) => {
      if (name === 'events') {
        return {
          getOne: vi.fn().mockResolvedValue({ id: 'event-1', registeredCount: 5, checkedInCount: 3 }),
          update: mockEventsUpdateForAdmin,
        }
      }
      if (name === 'registrations') {
        return {
          getList: vi.fn().mockResolvedValue({ totalItems: 0, items: [] }),
          getOne: vi.fn().mockResolvedValue({ id: 'reg-1', event: 'event-1', registrationStatus: 'confirmed' }),
        }
      }
      throw new Error(`Unexpected collection: ${name}`)
    }),
  }),
}))

function mockPB(
  collections: Record<string, Record<string, Mock>>,
): PocketBase {
  return {
    collection: vi.fn((name: string) => {
      const c = collections[name]
      if (!c) throw new Error(`Unexpected collection: ${name}`)
      return c
    }),
  } as unknown as PocketBase
}

describe('RegistrationError', () => {
  it('extends Error with name and statusCode', () => {
    const err = new RegistrationError('test error')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('RegistrationError')
    expect(err.message).toBe('test error')
  })

  it('defaults statusCode to 400', () => {
    const err = new RegistrationError('test error')
    expect(err.statusCode).toBe(400)
  })
})

describe('createRegistration', () => {
  const sampleData = {
    userId: 'user-1',
    eventId: 'event-1',
    userName: 'Test User',
    userEmail: 'test@example.com',
    userPhone: '1234567890',
    formResponses: {},
  }

  it('creates a free registration with ticketId and bumps registeredCount', async () => {
    const events = {
      getOne: vi.fn().mockResolvedValue({
        id: 'event-1',
        registrationOpen: true,
        maxCapacity: 100,
        price: 0,
        formTemplate: [],
      }),
      update: vi.fn().mockResolvedValue({}),
    }
    const regs = {
      getList: vi.fn().mockResolvedValue({ totalItems: 0, items: [] }),
      create: vi.fn().mockResolvedValue({ id: 'reg-1' }),
      update: vi.fn().mockResolvedValue({}),
    }
    const pb = mockPB({ events, registrations: regs })

    const result = await createRegistration(pb, sampleData)

    expect(result).toMatchObject({ registrationId: 'reg-1', paymentRequired: false, amount: 0 })
    // Free events bump registeredCount via bumpEventCounter, which writes to
    // the passed pb's events collection with an atomic increment.
    expect(events.update).toHaveBeenCalled()
  })

  it('creates a paid registration with paymentTicketId (no counter bump)', async () => {
    const events = {
      getOne: vi.fn().mockResolvedValue({
        id: 'event-1',
        registrationOpen: true,
        maxCapacity: 100,
        price: 100,
        formTemplate: [],
      }),
      update: vi.fn().mockResolvedValue({}),
    }
    const regs = {
      getList: vi.fn().mockResolvedValue({ totalItems: 0, items: [] }),
      create: vi.fn().mockResolvedValue({ id: 'reg-paid-1' }),
      update: vi.fn().mockResolvedValue({}),
    }
    const pb = mockPB({ events, registrations: regs })

    const result = await createRegistration(pb, { ...sampleData, eventId: 'event-1' })

    expect(result.paymentRequired).toBe(true)
    expect(result.amount).toBe(100)
  })
})

describe('confirmRegistration', () => {
  it('sets registrationStatus to confirmed, generates ticketId, and bumps registeredCount', async () => {
    const regs = {
      getOne: vi.fn().mockResolvedValue({
        id: 'reg-1',
        event: 'event-1',
        registrationStatus: 'pending',
        ticketId: '',
      }),
      update: vi.fn().mockResolvedValue({}),
    }
    const events = {
      getOne: vi.fn().mockResolvedValue({ id: 'event-1', registeredCount: 5 }),
      update: vi.fn().mockResolvedValue({}),
    }
    const pb = mockPB({ events, registrations: regs })

    await confirmRegistration(pb, 'reg-1')

    expect(regs.update).toHaveBeenCalledWith('reg-1', {
      registrationStatus: 'confirmed',
      ticketId: expect.any(String),
    })
    expect(events.update).toHaveBeenCalled()
  })
})

describe('cancelRegistration', () => {
  it('sets registrationStatus to cancelled and decrements registeredCount if confirmed', async () => {
    const regs = {
      getOne: vi.fn().mockResolvedValue({
        id: 'reg-1',
        event: 'event-1',
        registrationStatus: 'confirmed',
      }),
      update: vi.fn().mockResolvedValue({}),
    }
    const events = { getOne: vi.fn(), update: vi.fn() }
    const pb = mockPB({ events, registrations: regs })

    await cancelRegistration(pb, 'reg-1')

    expect(regs.update).toHaveBeenCalledWith('reg-1', { registrationStatus: 'cancelled' })
    expect(events.update).toHaveBeenCalled()
  })
})

describe('checkInRegistration', () => {
  it('marks checkedIn, sets checkedInAt, and bumps checkedInCount', async () => {
    const regs = {
      getOne: vi.fn().mockResolvedValue({
        id: 'reg-1',
        event: 'event-1',
        checkedIn: false,
      }),
      update: vi.fn().mockResolvedValue({}),
    }
    const events = { getOne: vi.fn(), update: vi.fn() }
    const pb = mockPB({ events, registrations: regs })

    await checkInRegistration(pb, 'reg-1')

    expect(regs.update).toHaveBeenCalledWith('reg-1', {
      checkedIn: true,
      checkedInAt: expect.any(String),
    })
    expect(events.update).toHaveBeenCalled()
  })
})
