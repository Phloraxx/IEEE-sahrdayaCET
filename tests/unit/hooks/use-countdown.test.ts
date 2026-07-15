import { describe, expect, it } from 'vitest'
import { formatCountdown, type CountdownParts } from '@/hooks/use-countdown'

const active: CountdownParts = {
  days: 2,
  hours: 5,
  minutes: 12,
  seconds: 9,
  totalMs: 2 * 86_400_000,
  expired: false,
}

describe('formatCountdown', () => {
  it('uses a shorter mobile string when compact', () => {
    expect(formatCountdown(active, true)).toBe('2d 5h 12m')
    expect(formatCountdown(active)).toContain('Kicks off in')
  })

  it('returns Kickoff now when expired', () => {
    expect(formatCountdown({ ...active, expired: true, totalMs: 0 })).toBe('Kickoff now')
  })
})