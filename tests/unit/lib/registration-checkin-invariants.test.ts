import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

type TransitionInput = {
  oldCheckedIn: boolean
  newCheckedIn: boolean
  newStatus: string
  oldCheckedInAt?: string
  newCheckedInAt?: string
}

type TransitionResult = {
  action: 'none' | 'check_in' | 'clear' | 'error'
  message?: string
}

const { resolveCheckInTransition } = require(
  '../../../pb_hooks/registration-checkin-invariants.js',
) as {
  resolveCheckInTransition: (input: TransitionInput) => TransitionResult
}

describe('registration check-in invariants', () => {
  it('allows a confirmed registration to begin check-in validation', () => {
    expect(
      resolveCheckInTransition({
        oldCheckedIn: false,
        newCheckedIn: true,
        newStatus: 'confirmed',
      }),
    ).toEqual({ action: 'check_in' })
  })

  it('rejects checking in a non-confirmed registration', () => {
    expect(
      resolveCheckInTransition({
        oldCheckedIn: false,
        newCheckedIn: true,
        newStatus: 'pending',
      }),
    ).toEqual({
      action: 'error',
      message: 'Only confirmed registrations can be checked in',
    })
  })

  it('clears check-in when a checked-in registration is cancelled', () => {
    expect(
      resolveCheckInTransition({
        oldCheckedIn: true,
        newCheckedIn: true,
        newStatus: 'cancelled',
        oldCheckedInAt: '2026-07-18T10:00:00.000Z',
        newCheckedInAt: '2026-07-18T10:00:00.000Z',
      }),
    ).toEqual({ action: 'clear' })
  })

  it('clears the timestamp on an explicit uncheck', () => {
    expect(
      resolveCheckInTransition({
        oldCheckedIn: true,
        newCheckedIn: false,
        newStatus: 'confirmed',
        oldCheckedInAt: '2026-07-18T10:00:00.000Z',
      }),
    ).toEqual({ action: 'clear' })
  })

  it('rejects direct timestamp rewrites without a state transition', () => {
    expect(
      resolveCheckInTransition({
        oldCheckedIn: true,
        newCheckedIn: true,
        newStatus: 'confirmed',
        oldCheckedInAt: '2026-07-18T10:00:00.000Z',
        newCheckedInAt: '2026-07-18T11:00:00.000Z',
      }),
    ).toEqual({
      action: 'error',
      message: 'Check-in timestamp is managed by the server',
    })
  })

  it('does nothing for an unrelated update that preserves valid check-in state', () => {
    expect(
      resolveCheckInTransition({
        oldCheckedIn: true,
        newCheckedIn: true,
        newStatus: 'confirmed',
        oldCheckedInAt: '2026-07-18T10:00:00.000Z',
        newCheckedInAt: '2026-07-18T10:00:00.000Z',
      }),
    ).toEqual({ action: 'none' })
  })

  it('counts only confirmed checked-in registrations in the counter helper', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'pb_hooks/registration-helpers.js'),
      'utf8',
    )
    expect(source).toContain(
      'event = {:eventId} && registrationStatus = {:status} && checkedIn = {:checked}',
    )
  })
})
