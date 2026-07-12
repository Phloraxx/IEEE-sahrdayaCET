import { describe, it, expect } from 'vitest'
import { parseEspnSyncEvent } from '@/lib/fifa-espn-sync'
import {
  buildMockEspnScoreboardEvent,
  defaultEspnTestMatchConfig,
  resolveMockEspnMinute,
  resolveMockEspnPhase,
} from '@/lib/fifa-mock-espn'

describe('resolveMockEspnPhase', () => {
  const kickoff = '2026-07-12T07:00:00.000Z' // 12:30 PM IST
  const end = '2026-07-12T08:29:00.000Z' // 1:59 PM IST

  it('returns pre before kickoff', () => {
    expect(resolveMockEspnPhase(kickoff, end, new Date('2026-07-12T06:00:00.000Z'))).toBe('pre')
  })
  it('returns in between kickoff and end', () => {
    expect(resolveMockEspnPhase(kickoff, end, new Date('2026-07-12T07:45:00.000Z'))).toBe('in')
  })
  it('returns post at and after end', () => {
    expect(resolveMockEspnPhase(kickoff, end, new Date('2026-07-12T08:29:00.000Z'))).toBe('post')
    expect(resolveMockEspnPhase(kickoff, end, new Date('2026-07-12T10:00:00.000Z'))).toBe('post')
  })
})

describe('defaultEspnTestMatchConfig', () => {
  it('ends at 1:59 PM IST on the given day', () => {
    const cfg = defaultEspnTestMatchConfig(new Date('2026-07-12T12:00:00+05:30'))
    expect(cfg.end_at).toBe('2026-07-12T08:29:00.000Z')
    expect(cfg.kickoff_at).toBe('2026-07-12T07:00:00.000Z')
    expect(cfg.espnId).toBe('mock-20260712-france-england')
  })
})

describe('buildMockEspnScoreboardEvent', () => {
  const cfg = defaultEspnTestMatchConfig(new Date('2026-07-12T12:00:00+05:30'))

  it('parses to finished post-match state after FT', () => {
    const raw = buildMockEspnScoreboardEvent(
      {
        espnId: cfg.espnId,
        team_home: cfg.team_home,
        team_away: cfg.team_away,
        stage: cfg.stage,
        mock: cfg.mock,
      },
      new Date('2026-07-12T09:00:00.000Z'),
    )
    const ev = parseEspnSyncEvent(raw)!
    expect(ev.statusState).toBe('post')
    expect(ev.homeGoals).toBe(2)
    expect(ev.awayGoals).toBe(1)
    expect(ev.homeWinner).toBe(true)
  })

  it('parses to live in-play state with live scores', () => {
    const raw = buildMockEspnScoreboardEvent(
      {
        espnId: cfg.espnId,
        team_home: cfg.team_home,
        team_away: cfg.team_away,
        mock: cfg.mock,
      },
      new Date('2026-07-12T07:30:00.000Z'),
    )
    const ev = parseEspnSyncEvent(raw)!
    expect(ev.statusState).toBe('in')
    expect(ev.homeGoals).toBe(1)
    expect(ev.awayGoals).toBe(0)
  })

  it('computes a match minute while live', () => {
    const minute = resolveMockEspnMinute(
      cfg.mock.kickoff_at,
      cfg.mock.end_at,
      new Date('2026-07-12T07:44:30.000Z'),
    )
    expect(minute).toBeGreaterThan(0)
    expect(minute).toBeLessThanOrEqual(90)
  })
})