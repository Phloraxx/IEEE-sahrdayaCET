import { describe, it, expect } from 'vitest'
import {
  mapEspnStatus,
  parseEspnSyncEvent,
  buildSettlePayload,
  autoSettleMarketTypes,
  shouldAutoSettle,
  shouldSkipSettle,
  shouldPollMatch,
  espnScoreboardDateParam,
  espnDatesForPoll,
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

describe('shouldPollMatch', () => {
  const base: FifaMatchForSync = {
    id: 'm1',
    team_home: 'Argentina',
    team_away: 'Switzerland',
    status: 'upcoming',
    kickoff_at: '2026-07-12T01:00:00.000Z',
  }

  it('polls upcoming matches within ±2h of kickoff', () => {
    const now = new Date('2026-07-12T02:00:00.000Z')
    expect(shouldPollMatch(base, now)).toBe(true)
  })

  it('polls stale upcoming matches after kickoff has passed', () => {
    const now = new Date('2026-07-14T12:00:00.000Z')
    expect(shouldPollMatch(base, now)).toBe(true)
  })

  it('does not poll upcoming matches far before kickoff', () => {
    const now = new Date('2026-07-11T20:00:00.000Z')
    expect(shouldPollMatch(base, now)).toBe(false)
  })

  it('always polls live matches', () => {
    const now = new Date('2026-07-20T00:00:00.000Z')
    expect(shouldPollMatch({ ...base, status: 'live' }, now)).toBe(true)
  })
})

describe('espnDatesForPoll', () => {
  it('includes today and each polled kickoff date', () => {
    const now = new Date('2026-07-14T12:00:00.000Z')
    const dates = espnDatesForPoll(
      [
        { id: 'a', team_home: 'Argentina', team_away: 'Switzerland', status: 'upcoming', kickoff_at: '2026-07-12T01:00:00.000Z' },
        { id: 'b', team_home: 'France', team_away: 'Spain', status: 'upcoming', kickoff_at: '2026-07-14T19:00:00.000Z' },
      ],
      now,
    )
    expect(dates).toContain('20260714')
    expect(dates).toContain('20260712')
  })

  it('formats kickoff as ESPN YYYYMMDD UTC', () => {
    expect(espnScoreboardDateParam('2026-07-12T01:00:00.000Z')).toBe('20260712')
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

// Minimal raw ESPN scoreboard event builder for parser tests.
function rawEspnEvent(opts: {
  statusName?: string
  homeScore?: string
  awayScore?: string
  homeWinner?: boolean
  awayWinner?: boolean
}) {
  return {
    id: 'e1',
    competitions: [
      {
        status: { type: { state: 'post', name: opts.statusName ?? 'STATUS_FULL_TIME' } },
        competitors: [
          { homeAway: 'home', score: opts.homeScore ?? '1', winner: opts.homeWinner, team: { displayName: 'France' } },
          { homeAway: 'away', score: opts.awayScore ?? '1', winner: opts.awayWinner, team: { displayName: 'England' } },
        ],
      },
    ],
  }
}

describe('parseEspnSyncEvent — ET/pens detection', () => {
  it('plain full-time has no ET/pens flags', () => {
    const ev = parseEspnSyncEvent(rawEspnEvent({}))!
    expect(ev.afterExtraTime).toBe(false)
    expect(ev.afterPenalties).toBe(false)
  })
  it('detects AET from the status name', () => {
    const ev = parseEspnSyncEvent(rawEspnEvent({ statusName: 'STATUS_FINAL_AET' }))!
    expect(ev.afterExtraTime).toBe(true)
    expect(ev.afterPenalties).toBe(false)
  })
  it('detects penalties (implies extra time)', () => {
    const ev = parseEspnSyncEvent(rawEspnEvent({ statusName: 'STATUS_FINAL_PEN' }))!
    expect(ev.afterExtraTime).toBe(true)
    expect(ev.afterPenalties).toBe(true)
  })
  it('parses competitor winner flags', () => {
    const ev = parseEspnSyncEvent(rawEspnEvent({ homeWinner: true, awayWinner: false }))!
    expect(ev.homeWinner).toBe(true)
    expect(ev.awayWinner).toBe(false)
  })
})

describe('buildSettlePayload — ET/pens', () => {
  const match: FifaMatchForSync = { id: 'm1', team_home: 'France', team_away: 'England', status: 'finished' }

  it('level score + winner flag → advance set, pens inferred', () => {
    const ev = parseEspnSyncEvent(rawEspnEvent({ homeScore: '1', awayScore: '1', awayWinner: true, homeWinner: false }))!
    const p = buildSettlePayload(match, ev)
    expect(p.result_winner).toBe('draw')
    expect(p.result_advance).toBe('away')
    expect(p.result_after_penalties).toBe(true)
    expect(p.result_after_extra_time).toBe(true)
  })

  it('level score + winner flag respects reversed home/away orientation', () => {
    // ESPN lists England as home, our match record has France home.
    const ev = parseEspnSyncEvent({
      ...rawEspnEvent({ homeScore: '2', awayScore: '2', homeWinner: true }),
      competitions: [
        {
          status: { type: { state: 'post', name: 'STATUS_FINAL_PEN' } },
          competitors: [
            { homeAway: 'home', score: '2', winner: true, team: { displayName: 'England' } },
            { homeAway: 'away', score: '2', winner: false, team: { displayName: 'France' } },
          ],
        },
      ],
    })!
    const p = buildSettlePayload(match, ev)
    // England won the shootout; England is our team_away → advance = away.
    expect(p.result_advance).toBe('away')
    expect(p.result_after_penalties).toBe(true)
  })

  it('decisive AET score keeps winner but flags extra time', () => {
    const ev = parseEspnSyncEvent(rawEspnEvent({ statusName: 'STATUS_FINAL_AET', homeScore: '2', awayScore: '1' }))!
    const p = buildSettlePayload(match, ev)
    expect(p.result_winner).toBe('home')
    expect(p.result_advance).toBe('home')
    expect(p.result_after_extra_time).toBe(true)
    expect(p.result_after_penalties).toBe(false)
  })

  it('level score with no winner flag leaves advance empty for the admin', () => {
    const ev = parseEspnSyncEvent(rawEspnEvent({ homeScore: '0', awayScore: '0' }))!
    const p = buildSettlePayload(match, ev)
    expect(p.result_winner).toBe('draw')
    expect(p.result_advance).toBe('')
  })
})

describe('autoSettleMarketTypes', () => {
  it('90-min finish allows all score-determined markets', () => {
    const types = autoSettleMarketTypes(false)
    expect(types.has('match_winner')).toBe(true)
    expect(types.has('correct_score')).toBe(true)
    expect(types.has('total_goals_ou')).toBe(true)
    expect(types.has('clean_sheet')).toBe(true)
  })
  it('ET/pens restricts auto-settle to match_winner only', () => {
    const types = autoSettleMarketTypes(true)
    expect(types.has('match_winner')).toBe(true)
    expect(types.has('correct_score')).toBe(false)
    expect(types.has('total_goals_ou')).toBe(false)
    expect(types.has('clean_sheet')).toBe(false)
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