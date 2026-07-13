// Mock ESPN scoreboard events for FIFA test matches (FIFA-GAME.md §2.6).
// Matches with external_ids.mock === true get lifecycle-driven ESPN payloads
// merged into the espn-sync cron and /api/fifa/live-scores overlay.

export type MockEspnPhase = 'pre' | 'in' | 'post'

export interface MockEspnConfig {
  /** ISO kickoff — betting locks at this moment in the mock timeline. */
  kickoff_at: string
  /** ISO full-time (incl. stoppage) — mock transitions to post after this. */
  end_at: string
  home_goals: number
  away_goals: number
  /** Optional live score while in-play (defaults to final). */
  live_home_goals?: number
  live_away_goals?: number
}

export interface MockEspnMatchInput {
  espnId: string
  team_home: string
  team_away: string
  stage?: string
  mock: MockEspnConfig
}

/** Resolve ESPN status.type.state from wall-clock vs kickoff/end. */
export function resolveMockEspnPhase(
  kickoffAt: string,
  endAt: string,
  now: Date = new Date(),
): MockEspnPhase {
  const kickoff = new Date(kickoffAt).getTime()
  const end = new Date(endAt).getTime()
  const t = now.getTime()
  if (isNaN(kickoff) || isNaN(end)) return 'pre'
  if (t < kickoff) return 'pre'
  if (t >= end) return 'post'
  return 'in'
}

/** Approximate match minute for live overlay (0–90+). */
export function resolveMockEspnMinute(
  kickoffAt: string,
  endAt: string,
  now: Date = new Date(),
): number | null {
  const phase = resolveMockEspnPhase(kickoffAt, endAt, now)
  if (phase !== 'in') return null
  const kickoff = new Date(kickoffAt).getTime()
  const end = new Date(endAt).getTime()
  const elapsedMs = now.getTime() - kickoff
  const totalMs = end - kickoff
  if (totalMs <= 0) return 0
  const ratio = Math.min(1, Math.max(0, elapsedMs / totalMs))
  return Math.min(95, Math.floor(ratio * 90) + 1)
}

function espnStatusName(phase: MockEspnPhase, minute: number | null): string {
  if (phase === 'pre') return 'STATUS_SCHEDULED'
  if (phase === 'post') return 'STATUS_FULL_TIME'
  if (minute !== null && minute > 45) return 'STATUS_SECOND_HALF'
  return 'STATUS_FIRST_HALF'
}

/** Build a raw ESPN scoreboard event object (site.api.espn.com shape). */
export function buildMockEspnScoreboardEvent(
  input: MockEspnMatchInput,
  now: Date = new Date(),
): Record<string, unknown> {
  const { mock, espnId, team_home, team_away } = input
  const phase = resolveMockEspnPhase(mock.kickoff_at, mock.end_at, now)
  const minute = resolveMockEspnMinute(mock.kickoff_at, mock.end_at, now)
  const statusName = espnStatusName(phase, minute)
  const state = phase === 'pre' ? 'pre' : phase === 'in' ? 'in' : 'post'

  const homeGoals =
    phase === 'pre'
      ? undefined
      : phase === 'in'
        ? (mock.live_home_goals ?? mock.home_goals)
        : mock.home_goals
  const awayGoals =
    phase === 'pre'
      ? undefined
      : phase === 'in'
        ? (mock.live_away_goals ?? mock.away_goals)
        : mock.away_goals

  const homeWon = phase === 'post' && mock.home_goals > mock.away_goals
  const awayWon = phase === 'post' && mock.away_goals > mock.home_goals

  const statusType: Record<string, unknown> = { state, name: statusName }
  const compStatus: Record<string, unknown> = {
    type: statusType,
    ...(phase === 'in' && minute !== null ? { clock: minute * 60 } : {}),
  }

  return {
    id: espnId,
    date: mock.kickoff_at,
    status: { type: statusType },
    competitions: [
      {
        date: mock.kickoff_at,
        status: compStatus,
        notes: input.stage ? [{ headline: stageHeadline(input.stage) }] : [],
        competitors: [
          {
            homeAway: 'home',
            ...(homeGoals !== undefined ? { score: String(homeGoals) } : {}),
            ...(phase === 'post' ? { winner: homeWon } : {}),
            team: { displayName: team_home, name: team_home },
          },
          {
            homeAway: 'away',
            ...(awayGoals !== undefined ? { score: String(awayGoals) } : {}),
            ...(phase === 'post' ? { winner: awayWon } : {}),
            team: { displayName: team_away, name: team_away },
          },
        ],
      },
    ],
  }
}

/** Full ESPN scoreboard envelope. */
export function buildMockEspnScoreboard(
  matches: MockEspnMatchInput[],
  now: Date = new Date(),
): { events: Record<string, unknown>[] } {
  return {
    events: matches.map((m) => buildMockEspnScoreboardEvent(m, now)),
  }
}

function stageHeadline(stage: string): string {
  const map: Record<string, string> = {
    r32: 'Round of 32',
    r16: 'Round of 16',
    qf: 'Quarter-final',
    sf: 'Semi-final',
    third_place: 'Match for third place',
    final: 'Final',
    group: 'Group stage',
  }
  return map[stage] || stage
}

function localWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tzOffsetMinutes: number,
): string {
  // wall-clock in UTC+offset → subtract offset to get UTC instant
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, 0) - tzOffsetMinutes * 60_000
  return new Date(utcMs).toISOString()
}

/** Default test fixture: France 2–1 England, ends 1:59 PM local on a given day. */
export function defaultEspnTestMatchConfig(
  date: Date = new Date(),
  tzOffsetMinutes = 330,
): {
  team_home: string
  team_away: string
  stage: string
  espnId: string
  kickoff_at: string
  end_at: string
  mock: MockEspnConfig
  external_ids: { espn: string; mock: true; mock_config: MockEspnConfig }
} {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  const dayKey = `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`

  // 12:30 PM local → kickoff; 1:59 PM local → full-time (IST +05:30 default).
  const kickoff_at = localWallClockToUtc(y, m, d, 12, 30, tzOffsetMinutes)
  const end_at = localWallClockToUtc(y, m, d, 13, 59, tzOffsetMinutes)

  const espnId = `mock-${dayKey}-france-england`
  const mock: MockEspnConfig = {
    kickoff_at,
    end_at,
    home_goals: 2,
    away_goals: 1,
    live_home_goals: 1,
    live_away_goals: 0,
  }

  return {
    team_home: 'France',
    team_away: 'England',
    stage: 'qf',
    espnId,
    kickoff_at: mock.kickoff_at,
    end_at: mock.end_at,
    mock,
    external_ids: { espn: espnId, mock: true, mock_config: mock },
  }
}

/** Map mock phase to fifa_matches status for initial create. */
export function mockPhaseToMatchStatus(phase: MockEspnPhase): 'upcoming' | 'live' | 'finished' {
  if (phase === 'in') return 'live'
  if (phase === 'post') return 'finished'
  return 'upcoming'
}