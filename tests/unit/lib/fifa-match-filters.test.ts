import { describe, it, expect } from 'vitest'
import {
  filterPublicActiveFifaMatches,
  isPublicActiveFifaMatch,
  isUpcomingOrLiveMatch,
} from '@/lib/fifa-match-filters'

describe('fifa-match-filters', () => {
  it('treats upcoming and live as active', () => {
    expect(isUpcomingOrLiveMatch({ status: 'upcoming' })).toBe(true)
    expect(isUpcomingOrLiveMatch({ status: 'live' })).toBe(true)
    expect(isUpcomingOrLiveMatch({ status: 'finished' })).toBe(false)
  })

  it('excludes test matches and finished fixtures', () => {
    expect(
      isPublicActiveFifaMatch({
        status: 'upcoming',
        team_home: 'France',
      }),
    ).toBe(true)
    expect(
      isPublicActiveFifaMatch({
        status: 'finished',
        team_home: 'Argentina',
      }),
    ).toBe(false)
    expect(
      isPublicActiveFifaMatch({
        status: 'upcoming',
        team_home: 'Test Squad',
      }),
    ).toBe(false)
  })

  it('keeps all upcoming/live public matches', () => {
    const active = filterPublicActiveFifaMatches([
      { status: 'finished', team_home: 'Argentina', kickoff_at: '2026-07-12T01:00:00.000Z' },
      { status: 'upcoming', team_home: 'France', kickoff_at: '2026-07-14T19:00:00.000Z' },
      { status: 'upcoming', team_home: 'England', kickoff_at: '2026-07-15T19:00:00.000Z' },
    ])
    expect(active).toHaveLength(2)
    expect(active.map((m) => m.team_home)).toEqual(['France', 'England'])
  })
})