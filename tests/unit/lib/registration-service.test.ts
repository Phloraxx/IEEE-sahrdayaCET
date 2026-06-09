import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  RegistrationError,
  validateRegistration,
  generateTicketId,
  incrementRegisteredCount,
  decrementRegisteredCount,
  incrementCheckedInCount,
  createRegistration,
  confirmRegistration,
  cancelRegistration,
  checkInRegistration,
  softDeleteEvent,
} from '@/lib/registration-service'

// ─── Helpers ───────────────────────────────────────────────

function mockCollection(methods: Record<string, unknown>) {
  return vi.fn(() => methods) as unknown as ReturnType<typeof vi.fn>
}

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
  } as ReturnType<typeof vi.fn>
}

// Re-usable mock PocketBase that returns undefined for unexpected calls
function createMockPB() {
  const registrations = mockRegistrationsCollection()
  const events = mockEventsCollection()
  const pb = makePB(registrations, events)
  return { pb, registrations, events }
}

// ─── RegistrationError ────────────────────────────────────

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

// ─── validateRegistration ──────────────────────────────────

describe('validateRegistration', () => {
  it('returns event and isFree flag when valid', async () => {
    const { pb, events } = createMockPB()
    events.getOne.mockResolvedValue({
      id: 'event-1',
      registrationOpen: true,
      registrationDeadline: null,
      maxCapacity: 100,
      registeredCount: 5,
      price: 0,
    })
    pb.collection('registrations').getFullList = vi.fn().mockResolvedValue([])

    const result = await validateRegistration(pb as any, 'event-1', 'user-1')

    expect(result.event.id).toBe('event-1')
    expect(result.isFree).toBe(true)
  })

  it('isFree is false when price > 0', async () => {
    const { pb, events } = createMockPB()
    events.getOne.mockResolvedValue({
      id: 'event-1',
      registrationOpen: true,
      registrationDeadline: null,
      maxCapacity: 100,
      registeredCount: 0,
      price: 50,
    })
    pb.collection('registrations').getFullList = vi.fn().mockResolvedValue([])

    const result = await validateRegistration(pb as any, 'event-1', 'user-1')
    expect(result.isFree).toBe(false)
  })

  it('throws if event not found', async () => {
    const { pb, events } = createMockPB()
    events.getOne.mockRejectedValue(new Error('not found'))

    await expect(validateRegistration(pb as any, 'bad-id', 'user-1')).rejects.toThrow(RegistrationError)
    await expect(validateRegistration(pb as any, 'bad-id', 'user-1')).rejects.toMatchObject({
      message: 'Event not found',
      statusCode: 404,
    })
  })

  it('throws if registration is not open', async () => {
    const { pb, events } = createMockPB()
    events.getOne.mockResolvedValue({
      id: 'event-1',
      registrationOpen: false,
    })

    await expect(validateRegistration(pb as any, 'event-1', 'user-1')).rejects.toMatchObject({
      message: 'Registration is not open for this event',
      statusCode: 400,
    })
  })

  it('throws if deadline has passed', async () => {
    const { pb, events } = createMockPB()
    events.getOne.mockResolvedValue({
      id: 'event-1',
      registrationOpen: true,
      registrationDeadline: '2020-01-01T00:00:00Z',
    })

    await expect(validateRegistration(pb as any, 'event-1', 'user-1')).rejects.toMatchObject({
      message: 'Registration deadline has passed',
      statusCode: 400,
    })
  })

  it('throws if capacity is full', async () => {
    const { pb, events } = createMockPB()
    events.getOne.mockResolvedValue({
      id: 'event-1',
      registrationOpen: true,
      registrationDeadline: null,
      maxCapacity: 10,
      registeredCount: 10,
    })

    await expect(validateRegistration(pb as any, 'event-1', 'user-1')).rejects.toMatchObject({
      message: 'Event has reached maximum capacity',
      statusCode: 400,
    })
  })

  it('throws on duplicate registration', async () => {
    const { pb, events } = createMockPB()
    events.getOne.mockResolvedValue({
      id: 'event-1',
      registrationOpen: true,
      registrationDeadline: null,
      maxCapacity: 100,
      registeredCount: 0,
      price: 0,
    })
    pb.collection('registrations').getFullList = vi.fn().mockResolvedValue([{ id: 'existing-reg' }])

    await expect(validateRegistration(pb as any, 'event-1', 'user-1')).rejects.toMatchObject({
      message: 'You are already registered for this event',
      statusCode: 400,
    })
  })
})

// ─── generateTicketId ─────────────────────────────────────

describe('generateTicketId', () => {
  it('generates TKT- prefixed hex string and updates registration', async () => {
    const adminPB = { collection: vi.fn() } as any
    const regs = { update: vi.fn().mockResolvedValue({}) }
    adminPB.collection.mockReturnValue(regs)

    const ticketId = await generateTicketId(adminPB, 'reg-1')

    expect(ticketId).toMatch(/^TKT-[a-f0-9]{12}$/)
    expect(regs.update).toHaveBeenCalledWith('reg-1', { ticketId })
  })
})

// ─── Counter Management ────────────────────────────────────

describe('counter management', () => {
  describe('incrementRegisteredCount', () => {
    it('increments from current value', async () => {
      const adminPB = { collection: vi.fn() } as any
      const events = { getOne: vi.fn(), update: vi.fn() }
      adminPB.collection.mockReturnValue(events)
      events.getOne.mockResolvedValue({ id: 'evt-1', registeredCount: 10 })

      await incrementRegisteredCount(adminPB, 'evt-1')

      expect(events.update).toHaveBeenCalledWith('evt-1', { registeredCount: 11 })
    })

    it('treats null count as 0', async () => {
      const adminPB = { collection: vi.fn() } as any
      const events = { getOne: vi.fn(), update: vi.fn() }
      adminPB.collection.mockReturnValue(events)
      events.getOne.mockResolvedValue({ id: 'evt-1', registeredCount: null })

      await incrementRegisteredCount(adminPB, 'evt-1')

      expect(events.update).toHaveBeenCalledWith('evt-1', { registeredCount: 1 })
    })

    it('does not throw on error (graceful)', async () => {
      const adminPB = { collection: vi.fn() } as any
      const events = { getOne: vi.fn().mockRejectedValue(new Error('DB error')), update: vi.fn() }
      adminPB.collection.mockReturnValue(events)

      await expect(incrementRegisteredCount(adminPB, 'evt-1')).resolves.toBeUndefined()
    })
  })

  describe('decrementRegisteredCount', () => {
    it('decrements from current value', async () => {
      const adminPB = { collection: vi.fn() } as any
      const events = { getOne: vi.fn(), update: vi.fn() }
      adminPB.collection.mockReturnValue(events)
      events.getOne.mockResolvedValue({ id: 'evt-1', registeredCount: 5 })

      await decrementRegisteredCount(adminPB, 'evt-1')

      expect(events.update).toHaveBeenCalledWith('evt-1', { registeredCount: 4 })
    })

    it('floors at 0', async () => {
      const adminPB = { collection: vi.fn() } as any
      const events = { getOne: vi.fn(), update: vi.fn() }
      adminPB.collection.mockReturnValue(events)
      events.getOne.mockResolvedValue({ id: 'evt-1', registeredCount: 0 })

      await decrementRegisteredCount(adminPB, 'evt-1')

      expect(events.update).toHaveBeenCalledWith('evt-1', { registeredCount: 0 })
    })
  })

  describe('incrementCheckedInCount', () => {
    it('increments from current value', async () => {
      const adminPB = { collection: vi.fn() } as any
      const events = { getOne: vi.fn(), update: vi.fn() }
      adminPB.collection.mockReturnValue(events)
      events.getOne.mockResolvedValue({ id: 'evt-1', checkedInCount: 3 })

      await incrementCheckedInCount(adminPB, 'evt-1')

      expect(events.update).toHaveBeenCalledWith('evt-1', { checkedInCount: 4 })
    })
  })
})

// ─── createRegistration ────────────────────────────────────

describe('createRegistration', () => {
  const sampleData = {
    userId: 'user-1',
    eventId: 'event-1',
    userName: 'John',
    userEmail: 'john@test.com',
    userPhone: '1234567890',
    formResponses: { name: 'John' },
  }

  it('creates a free registration with ticket and counter bump', async () => {
    const { pb: userPB, events: userEvents, registrations: userRegs } = createMockPB()
    const adminPB = { collection: vi.fn() } as any
    const adminEvents = { getOne: vi.fn(), update: vi.fn() }
    const adminRegs = { update: vi.fn() }
    adminPB.collection.mockImplementation((name: string) =>
      name === 'events' ? adminEvents : adminRegs,
    )

    // Validation reads
    userEvents.getOne.mockResolvedValue({
      id: 'event-1',
      registrationOpen: true,
      registrationDeadline: null,
      maxCapacity: 100,
      registeredCount: 5,
      price: 0,
    })
    userPB.collection('registrations').getFullList = vi.fn().mockResolvedValue([])

    // Create
    userRegs.create.mockResolvedValue({ id: 'reg-1', paymentStatus: 'not_required', registrationStatus: 'confirmed' })

    // Admin writes (ticket gen, counter)
    adminRegs.update.mockResolvedValue({})
    adminEvents.getOne.mockResolvedValue({ id: 'event-1', registeredCount: 5 })
    adminEvents.update.mockResolvedValue({})

    const result = await createRegistration(userPB as any, adminPB, sampleData)

    expect(result.registrationId).toBe('reg-1')
    expect(result.paymentRequired).toBe(false)
    expect(result.amount).toBe(0)
    expect(result.ticketId).toMatch(/^TKT-/)
    // Verify the create had free-event fields
    expect(userRegs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentStatus: 'not_required',
        registrationStatus: 'confirmed',
        amount: 0,
      }),
    )
    // Counter should have been bumped
    expect(adminEvents.update).toHaveBeenCalled()
  })

  it('creates a paid registration with paymentTicketId', async () => {
    const { pb: userPB, events: userEvents, registrations: userRegs } = createMockPB()
    const adminPB = { collection: vi.fn() } as any
    const adminRegs = { update: vi.fn() }
    adminPB.collection.mockReturnValue(adminRegs)

    userEvents.getOne.mockResolvedValue({
      id: 'event-1',
      registrationOpen: true,
      registrationDeadline: null,
      maxCapacity: 100,
      registeredCount: 0,
      price: 50,
    })
    userPB.collection('registrations').getFullList = vi.fn().mockResolvedValue([])
    userRegs.create.mockResolvedValue({ id: 'reg-1', paymentStatus: 'pending', registrationStatus: 'pending' })

    const result = await createRegistration(userPB as any, adminPB, sampleData)

    expect(result.registrationId).toBe('reg-1')
    expect(result.paymentRequired).toBe(true)
    expect(result.amount).toBe(50)
    // Should have set paymentTicketId
    expect(adminRegs.update).toHaveBeenCalledWith('reg-1', expect.objectContaining({ paymentTicketId: expect.any(String) }))
  })

  it('throws RegistrationError on validation failure', async () => {
    const { pb: userPB, events: userEvents } = createMockPB()
    const adminPB = { collection: vi.fn() } as any

    userEvents.getOne.mockResolvedValue({
      id: 'event-1',
      registrationOpen: false,
    })

    await expect(createRegistration(userPB as any, adminPB, sampleData)).rejects.toThrow(RegistrationError)
  })
})

// ─── confirmRegistration ───────────────────────────────────

describe('confirmRegistration', () => {
  it('sets status, generates ticket, and bumps counter on first confirmation', async () => {
    const adminPB = { collection: vi.fn() } as any
    const regs = { getOne: vi.fn(), update: vi.fn() }
    const events = { getOne: vi.fn(), update: vi.fn() }
    adminPB.collection.mockImplementation((name: string) =>
      name === 'registrations' ? regs : events,
    )

    regs.getOne.mockResolvedValue({
      id: 'reg-1',
      registrationStatus: 'pending',
      ticketId: null,
      event: 'event-1',
    })
    regs.update.mockResolvedValue({})
    events.getOne.mockResolvedValue({ id: 'event-1', registeredCount: 10 })
    events.update.mockResolvedValue({})

    await confirmRegistration(adminPB, 'reg-1')

    // Status was updated
    expect(regs.update).toHaveBeenCalledWith('reg-1', { registrationStatus: 'confirmed' })
    // Ticket was generated (second update call)
    expect(regs.update).toHaveBeenCalledWith('reg-1', expect.objectContaining({ ticketId: expect.any(String) }))
    // Counter was bumped
    expect(events.update).toHaveBeenCalledWith('event-1', { registeredCount: 11 })
  })

  it('skips counter bump if already confirmed', async () => {
    const adminPB = { collection: vi.fn() } as any
    const regs = { getOne: vi.fn(), update: vi.fn() }
    const events = { getOne: vi.fn(), update: vi.fn() }
    adminPB.collection.mockImplementation((name: string) =>
      name === 'registrations' ? regs : events,
    )

    regs.getOne.mockResolvedValue({
      id: 'reg-1',
      registrationStatus: 'confirmed',
      ticketId: null,
      event: 'event-1',
    })
    regs.update.mockResolvedValue({})
    events.getOne.mockResolvedValue({ id: 'event-1', registeredCount: 10 })
    events.update.mockResolvedValue({})

    await confirmRegistration(adminPB, 'reg-1')

    // Ticket still generated (was null)
    expect(regs.update).toHaveBeenCalledWith('reg-1', expect.objectContaining({ ticketId: expect.any(String) }))
    // But counter NOT bumped
    expect(events.update).not.toHaveBeenCalled()
  })
})

// ─── cancelRegistration ────────────────────────────────────

describe('cancelRegistration', () => {
  it('cancels and decrements counter if was confirmed', async () => {
    const adminPB = { collection: vi.fn() } as any
    const regs = { getOne: vi.fn(), update: vi.fn() }
    const events = { getOne: vi.fn(), update: vi.fn() }
    adminPB.collection.mockImplementation((name: string) =>
      name === 'registrations' ? regs : events,
    )

    regs.getOne.mockResolvedValue({
      id: 'reg-1',
      registrationStatus: 'confirmed',
      event: 'event-1',
    })
    regs.update.mockResolvedValue({})
    events.getOne.mockResolvedValue({ id: 'event-1', registeredCount: 10 })
    events.update.mockResolvedValue({})

    await cancelRegistration(adminPB, 'reg-1')

    expect(regs.update).toHaveBeenCalledWith('reg-1', { registrationStatus: 'cancelled' })
    expect(events.update).toHaveBeenCalledWith('event-1', { registeredCount: 9 })
  })

  it('does not decrement counter if was not confirmed', async () => {
    const adminPB = { collection: vi.fn() } as any
    const regs = { getOne: vi.fn(), update: vi.fn() }
    const events = { getOne: vi.fn(), update: vi.fn() }
    adminPB.collection.mockImplementation((name: string) =>
      name === 'registrations' ? regs : events,
    )

    regs.getOne.mockResolvedValue({
      id: 'reg-1',
      registrationStatus: 'pending',
      event: 'event-1',
    })

    await cancelRegistration(adminPB, 'reg-1')

    expect(events.update).not.toHaveBeenCalled()
  })
})

// ─── checkInRegistration ───────────────────────────────────

describe('checkInRegistration', () => {
  it('marks checked in and bumps checkedInCount', async () => {
    const adminPB = { collection: vi.fn() } as any
    const regs = { getOne: vi.fn(), update: vi.fn() }
    const events = { getOne: vi.fn(), update: vi.fn() }
    adminPB.collection.mockImplementation((name: string) =>
      name === 'registrations' ? regs : events,
    )

    regs.getOne.mockResolvedValue({
      id: 'reg-1',
      checkedIn: false,
      event: 'event-1',
    })
    regs.update.mockResolvedValue({})
    events.getOne.mockResolvedValue({ id: 'event-1', checkedInCount: 3 })
    events.update.mockResolvedValue({})

    await checkInRegistration(adminPB, 'reg-1')

    expect(regs.update).toHaveBeenCalledWith('reg-1', expect.objectContaining({
      checkedIn: true,
      checkedInAt: expect.any(String),
    }))
    expect(events.update).toHaveBeenCalledWith('event-1', { checkedInCount: 4 })
  })

  it('is idempotent if already checked in', async () => {
    const adminPB = { collection: vi.fn() } as any
    const regs = { getOne: vi.fn(), update: vi.fn() }
    adminPB.collection.mockReturnValue(regs)

    regs.getOne.mockResolvedValue({
      id: 'reg-1',
      checkedIn: true,
      event: 'event-1',
    })

    await checkInRegistration(adminPB, 'reg-1')

    expect(regs.update).not.toHaveBeenCalled()
  })
})

// ─── softDeleteEvent ───────────────────────────────────────

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
