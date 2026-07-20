import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

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

// The repository is ESM (`type: module`), while PocketBase's Goja `require()`
// loads hook helper files with CommonJS-style `module.exports`. Evaluate the
// exact deployed helper in a tiny CommonJS sandbox so Vitest exercises the same
// source without asking Node's ESM loader to import it directly.
function loadInvariantModule(): {
  resolveCheckInTransition: (input: TransitionInput) => TransitionResult
} {
  const source = readFileSync(
    resolve(process.cwd(), 'pb_hooks/registration-checkin-invariants.js'),
    'utf8',
  )
  const module = { exports: {} as Record<string, unknown> }
  runInNewContext(source, { module, exports: module.exports })
  return module.exports as {
    resolveCheckInTransition: (input: TransitionInput) => TransitionResult
  }
}

const { resolveCheckInTransition } = loadInvariantModule()

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
