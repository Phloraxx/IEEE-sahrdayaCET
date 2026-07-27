import { describe, expect, it } from 'vitest'
import {
  canRegisterForEvent,
  isPastEvent,
  isPublicEvent,
} from '@/lib/event-lifecycle'

const NOW = new Date('2026-07-20T12:00:00.000Z').getTime()

describe('event lifecycle', () => {
  it('keeps upcoming published events public and registerable', () => {
    const event = {
      status: 'published',
      date: '2026-07-25T10:00:00.000Z',
      endDate: '2026-07-25T12:00:00.000Z',
      registrationOpen: true,
    }

    expect(isPublicEvent(event)).toBe(true)
    expect(isPastEvent(event, NOW)).toBe(false)
    expect(canRegisterForEvent(event, NOW)).toBe(true)
  })

  it('keeps completed events public but never registerable', () => {
    const event = {
      status: 'completed',
      date: '2026-07-25T10:00:00.000Z',
      registrationOpen: true,
    }

    expect(isPublicEvent(event)).toBe(true)
    expect(isPastEvent(event, NOW)).toBe(true)
    expect(canRegisterForEvent(event, NOW)).toBe(false)
  })

  it('treats elapsed published events as past and closes registration', () => {
    const event = {
      status: 'published',
      date: '2026-07-19T10:00:00.000Z',
      endDate: '2026-07-19T12:00:00.000Z',
      registrationOpen: true,
    }

    expect(isPublicEvent(event)).toBe(true)
    expect(isPastEvent(event, NOW)).toBe(true)
    expect(canRegisterForEvent(event, NOW)).toBe(false)
  })

  it('uses endDate so multi-day events remain upcoming until they finish', () => {
    const event = {
      status: 'published',
      date: '2026-07-19T10:00:00.000Z',
      endDate: '2026-07-21T12:00:00.000Z',
      registrationOpen: true,
    }

    expect(isPastEvent(event, NOW)).toBe(false)
    expect(canRegisterForEvent(event, NOW)).toBe(true)
  })

  it('hides draft, cancelled, and deleted events from public lifecycle', () => {
    expect(isPublicEvent({ status: 'draft' })).toBe(false)
    expect(isPublicEvent({ status: 'cancelled' })).toBe(false)
    expect(isPublicEvent({ status: 'published', isDeleted: true })).toBe(false)
  })

  it('enforces registration start and deadline windows', () => {
    const base = {
      status: 'published',
      date: '2026-07-25T10:00:00.000Z',
      registrationOpen: true,
    }

    expect(
      canRegisterForEvent(
        { ...base, registrationStart: '2026-07-21T00:00:00.000Z' },
        NOW,
      ),
    ).toBe(false)

    expect(
      canRegisterForEvent(
        { ...base, registrationDeadline: '2026-07-19T23:59:59.000Z' },
        NOW,
      ),
    ).toBe(false)
  })
})
