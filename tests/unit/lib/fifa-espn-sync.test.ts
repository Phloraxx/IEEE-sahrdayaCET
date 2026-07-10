import { describe, it, expect } from 'vitest'
import {
  mapEspnStatus,
  shouldAutoSettle,
  shouldSkipSettle,
  type FifaMatchForSync,
  type FifaSettingsForSync,
} from '@/lib/fifa-espn-sync'

describe('mapEspnStatus', () => {
  it('maps pre → upcoming', () => {
    expect(mapEspnStatus('pre')).toBe('upcoming')
  })
  it('maps in → live', () => {
    expect(mapEspnStatus('in')).toBe('live')
  })
  it('maps post → finished', () => {
    expect(mapEspnStatus('post')).toBe('finished')
  })
  it('maps canceled → void', () => {
    expect(mapEspnStatus('canceled')).toBe('void')
    expect(mapEspnStatus('post', 'STATUS_CANCELED')).toBe('void')
  })
})

describe('shouldAutoSettle', () => {
  const enabledSettings: FifaSettingsForSync = { auto_settle_enabled: true, settle_delay_minutes: 15 }
  const pastSettleAt = '2026-07-10T12:00:00.000Z'
  const now = new Date('2026-07-10T12:30:00.000Z')

  const readyMatch = (overrides: Partial<FifaMatchForSync> = {}): FifaMatchForSync => ({
    id: 'm1',
    team_home: 'France',
    team_away: 'England',
    status: 'finished',
    settled: false,
    result_winner: 'home',
    result_home_goals: 2,
    result_away_goals: 1,
    auto_settle_at: pastSettleAt,
    ...overrides,
  })

  it('returns false when kill switch is off', () => {
    expect(shouldAutoSettle(
      readyMatch(),
      { auto_settle_enabled: false, settle_delay_minutes: 15 },
      now,
    )).toBe(false)
  })

  it('returns false when delay has not elapsed', () => {
    expect(shouldAutoSettle(
      readyMatch({ auto_settle_at: '2026-07-10T13:00:00.000Z' }),
      enabledSettings,
      now,
    )).toBe(false)
  })

  it('returns false when knockout draw without result_advance', () => {
    expect(shouldAutoSettle(
      readyMatch({ result_winner: 'draw', result_home_goals: 1, result_away_goals: 1 }),
      enabledSettings,
      now,
    )).toBe(false)
  })

  it('returns true when enabled, delay elapsed, and clear winner', () => {
    expect(shouldAutoSettle(readyMatch(), enabledSettings, now)).toBe(true)
  })

  it('returns true for knockout draw when result_advance is set', () => {
    expect(shouldAutoSettle(
      readyMatch({
        result_winner: 'draw',
        result_home_goals: 1,
        result_away_goals: 1,
        result_advance: 'home',
      }),
      enabledSettings,
      now,
    )).toBe(true)
  })
})

describe('settle idempotency', () => {
  it('already settled match should not re-settle', () => {
    const match: FifaMatchForSync = {
      id: 'm1',
      team_home: 'France',
      team_away: 'England',
      status: 'finished',
      settled: true,
      result_winner: 'home',
      result_home_goals: 2,
      result_away_goals: 1,
      auto_settle_at: '2026-07-10T12:00:00.000Z',
    }
    expect(shouldAutoSettle(
      match,
      { auto_settle_enabled: true, settle_delay_minutes: 15 },
      new Date('2026-07-10T13:00:00.000Z'),
    )).toBe(false)
    expect(shouldSkipSettle({ settled: true })).toBe(true)
    expect(shouldSkipSettle({ settled: false })).toBe(false)
  })
})