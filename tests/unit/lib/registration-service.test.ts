import { describe, it, expect, vi } from 'vitest'
import {
  RegistrationError,
  createRegistration,
  confirmRegistration,
  cancelRegistration,
  checkInRegistration,
  softDeleteEvent,
} from '@/lib/registration-service'

// Validation (capacity, deadline, duplicate, registration-open) is enforced by pb_hooks/registrations.pb.js

function mockRegistrationsCollection(overrides: Record<string, unknown> = {}) {
  return {
    create: vi.fn(),
    getOne: vi.fn(),
    getFullList: vi.fn(),
    getList: vi.fn(),
    update: vi.fn(),
    ...overrides,
  }
}

function mockEventsCollection(overrides: Record<string, unknown> = {}) {
  return {
    getOne: vi.fn(),
    update: vi.fn(),
    ...overrides,
  }
}

function makePB(
  regs: ReturnType<typeof mockRegistrationsCollection>,
  events: ReturnType<typeof mockEventsCollection>,
) {
  return {
    collection: vi.fn((name: string) => {
      if (name === 'registrations') return regs
      if (name === 'events') return events
      throw new Error(`Unexpected collection: ${name}`)
    }),
  } as any
}

function createMockPB() {
  const registrations = mockRegistrationsCollection()
  const events = mockEventsCollection()
  const pb = makePB(registrations, events)
  return { pb, registrations, events }
}

describe('RegistrationError', () => {
  it('extends Error with name and statusCode', () => {
    const err = new RegistrationError('test error', 409)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('RegistrationError')
    expect(err.message).toBe('test error')
    expect(err.statusCode).toBe(409)
  })

  it('defaults statusCode to 400', () => {
    const err = new RegistrationError('bad request')
    expect(err.statusCode).toBe(400)
  })
})

describe('createRegistration', () => {
  const sampleData = {
    userId: 'user-1',
    eventId: 'event-1',
    userName: 'John',
    userEmail: 'john@test.com',
    userPhone: '1234567890',
    formResponses: { name: 'John' },
  }

  it('creates a free registration', async () => {
    const { pb, events, registrations } = createMockPB()
    const adminPB = { collection: vi.fn() } as any

    events.getOne.mockResolvedValue({
      id: 'event-1',
      registrationOpen: true,
      registrationDeadline: null,
      maxCapacity: 100,
      registeredCount: 5,
      price: 0,
    })
    registrations.create.mockResolvedValue({ id: 'reg-1' })

    const result = await createRegistration(pb, adminPB, sampleData)

    expect(result.registrationId).toBe('reg-1')
    expect(result.paymentRequired).toBe(false)
    expect(result.amount).toBe(0)
    expect(registrations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentStatus: 'not_required',
        registrationStatus: 'confirmed',
        amount: 0,
      }),
    )
  })

  it('creates a paid registration with paymentTicketId', async () => {
    const { pb, events, registrations } = createMockPB()
    const adminPB = { collection: vi.fn() } as any
    const adminRegs = { update: vi.fn().mockResolvedValue({}) }
    adminPB.collection.mockReturnValue(adminRegs)

    events.getOne.mockResolvedValue({
      id: 'event-1',
      registrationOpen: true,
      registrationDeadline: null,
      maxCapacity: 100,
      registeredCount: 0,
      price: 50,
    })
    registrations.create.mockResolvedValue({ id: 'reg-1' })

    const result = await createRegistration(pb, adminPB, sampleData)

    expect(result.registrationId).toBe('reg-1')
    expect(result.paymentRequired).toBe(true)
    expect(result.amount).toBe(50)
    expect(adminRegs.update).toHaveBeenCalledWith(
      'reg-1',
      expect.objectContaining({ paymentTicketId: expect.any(String) }),
    )
  })
})

describe('confirmRegistration', () => {
  it('sets registrationStatus to confirmed on pending registration', async () => {
    const adminPB = { collection: vi.fn() } as any
    const regs = { getOne: vi.fn(), update: vi.fn() }
    adminPB.collection.mockReturnValue(regs)

    regs.getOne.mockResolvedValue({
      id: 'reg-1',
      registrationStatus: 'pending',
    })
    regs.update.mockResolvedValue({})

    await confirmRegistration(adminPB, 'reg-1')

    expect(regs.update).toHaveBeenCalledWith('reg-1', { registrationStatus: 'confirmed' })
    expect(regs.update).toHaveBeenCalledTimes(1)
  })

  it('skips update if already confirmed', async () => {
    const adminPB = { collection: vi.fn() } as any
    const regs = { getOne: vi.fn(), update: vi.fn() }
    adminPB.collection.mockReturnValue(regs)

    regs.getOne.mockResolvedValue({
      id: 'reg-1',
      registrationStatus: 'confirmed',
    })

    await confirmRegistration(adminPB, 'reg-1')

    expect(regs.update).not.toHaveBeenCalled()
  })
})

describe('cancelRegistration', () => {
  it('sets registrationStatus to cancelled', async () => {
    const adminPB = { collection: vi.fn() } as any
    const regs = { getOne: vi.fn(), update: vi.fn() }
    adminPB.collection.mockReturnValue(regs)

    regs.getOne.mockResolvedValue({
      id: 'reg-1',
      registrationStatus: 'confirmed',
    })
    regs.update.mockResolvedValue({})

    await cancelRegistration(adminPB, 'reg-1')

    expect(regs.update).toHaveBeenCalledWith('reg-1', { registrationStatus: 'cancelled' })
  })
})

describe('checkInRegistration', () => {
  it('marks checkedIn and sets checkedInAt', async () => {
    const adminPB = { collection: vi.fn() } as any
    const regs = { getOne: vi.fn(), update: vi.fn() }
    adminPB.collection.mockReturnValue(regs)

    regs.getOne.mockResolvedValue({
      id: 'reg-1',
      checkedIn: false,
    })
    regs.update.mockResolvedValue({})

    await checkInRegistration(adminPB, 'reg-1')

    expect(regs.update).toHaveBeenCalledWith(
      'reg-1',
      expect.objectContaining({
        checkedIn: true,
        checkedInAt: expect.any(String),
      }),
    )
  })

  it('is idempotent if already checked in', async () => {
    const adminPB = { collection: vi.fn() } as any
    const regs = { getOne: vi.fn(), update: vi.fn() }
    adminPB.collection.mockReturnValue(regs)

    regs.getOne.mockResolvedValue({
      id: 'reg-1',
      checkedIn: true,
    })

    await checkInRegistration(adminPB, 'reg-1')

    expect(regs.update).not.toHaveBeenCalled()
  })
})

describe('softDeleteEvent', () => {
  it('sets isDeleted, status, and registrationOpen', async () => {
    const adminPB = { collection: vi.fn() } as any
    const events = { update: vi.fn() }
    adminPB.collection.mockReturnValue(events)

    await softDeleteEvent(adminPB, 'event-1')

    expect(events.update).toHaveBeenCalledWith('event-1', {
      isDeleted: true,
      status: 'completed',
      registrationOpen: false,
    })
  })
})
