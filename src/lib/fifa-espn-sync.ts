// ESPN → PocketBase sync helpers (FIFA-AUTOMATION.md PR2).
// Pure functions for unit tests; pb_hooks/fifa.pb.js duplicates logic inline.

import { normalizeEspnEvent } from '@/lib/fifa-live'
import { normalizeTeamName } from '@/lib/fifa-team-names'

export type FifaSyncStatus = 'upcoming' | 'live' | 'finished' | 'void'

export interface EspnSyncEvent {
  id: string
  homeTeam: string
  awayTeam: string
  homeGoals: number | null
  awayGoals: number | null
  /** ESPN status.type.state — pre | in | post */
  statusState: string
  /** ESPN status.type.name — e.g. STATUS_CANCELED */
  statusName?: string
}

export interface FifaMatchForSync {
  id: string
  team_home: string
  team_away: string
  status: string
  external_ids?: { espn?: string } | null
  kickoff_at?: string
  settled?: boolean
  result_winner?: string
  result_advance?: string
  auto_settle_at?: string | null
  result_home_goals?: number
  result_away_goals?: number
}

export interface FifaSettingsForSync {
  auto_settle_enabled: boolean
  settle_delay_minutes: number
}

export interface SettlePayload {
  result_winner: 'home' | 'away' | 'draw'
  result_home_goals: number
  result_away_goals: number
  result_scorers: string[]
  result_yellow_cards: number
  result_red_cards: number
  result_home_clean_sheet: boolean
  result_away_clean_sheet: boolean
  result_advance: 'home' | 'away' | ''
}

export { normalizeTeamName, teamNamesMatch } from '@/lib/fifa-team-names'

/** Map ESPN status.type.state (+ optional name) to game status. */
export function mapEspnStatus(state: string, statusName?: string): FifaSyncStatus {
  const name = (statusName || '').toUpperCase()
  if (
    name.includes('CANCEL') ||
    name.includes('POSTPON') ||
    name.includes('SUSPEND') ||
    name.includes('DELAYED')
  ) {
    return 'void'
  }
  const s = (state || 'pre').toLowerCase()
  if (s === 'in') return 'live'
  if (s === 'post') return 'finished'
  if (s === 'canceled' || s === 'cancelled' || s === 'postponed') return 'void'
  return 'upcoming'
}

/** Parse raw ESPN scoreboard event into sync-friendly shape. */
export function parseEspnSyncEvent(raw: unknown): EspnSyncEvent | null {
  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  if (!rec) return null

  const competitions = Array.isArray(rec.competitions) ? rec.competitions : []
  const comp = competitions[0]
  if (!comp || typeof comp !== 'object') return null
  const compRec = comp as Record<string, unknown>
  const competitors = Array.isArray(compRec.competitors) ? compRec.competitors : []
  if (competitors.length < 2) return null

  const home = competitors.find(
    (c) => (c as Record<string, unknown>).homeAway === 'home',
  ) as Record<string, unknown> | undefined
  const away = competitors.find(
    (c) => (c as Record<string, unknown>).homeAway === 'away',
  ) as Record<string, unknown> | undefined
  if (!home || !away) return null

  const homeTeamObj = (home.team as Record<string, unknown>) || {}
  const awayTeamObj = (away.team as Record<string, unknown>) || {}
  const status = (compRec.status as Record<string, unknown>) || {}
  const statusType = (status.type as Record<string, unknown>) || {}
  const statusState = String(statusType.state || 'pre')
  const statusName = statusType.name ? String(statusType.name) : undefined

  const mapped = mapEspnStatus(statusState, statusName)
  const homeGoals =
    mapped === 'upcoming' ? null : numOrZero(home.score)
  const awayGoals =
    mapped === 'upcoming' ? null : numOrZero(away.score)

  return {
    id: String(rec.id || ''),
    homeTeam: String(
      homeTeamObj.displayName || homeTeamObj.name || homeTeamObj.abbreviation || '',
    ),
    awayTeam: String(
      awayTeamObj.displayName || awayTeamObj.name || awayTeamObj.abbreviation || '',
    ),
    homeGoals,
    awayGoals,
    statusState,
    statusName,
  }
}

/** Re-export live overlay normalizer for reuse in tests / import paths. */
export { normalizeEspnEvent }

/** Find PB match for an ESPN event via external_ids.espn or team names. */
export function findMatchForEspnEvent(
  matches: FifaMatchForSync[],
  event: EspnSyncEvent,
): FifaMatchForSync | null {
  for (const m of matches) {
    const espnId = m.external_ids?.espn
    if (espnId && espnId === event.id) return m
  }

  const eh = normalizeTeamName(event.homeTeam)
  const ea = normalizeTeamName(event.awayTeam)
  for (const m of matches) {
    const mh = normalizeTeamName(m.team_home)
    const ma = normalizeTeamName(m.team_away)
    if ((mh === eh && ma === ea) || (mh === ea && ma === eh)) return m
  }
  return null
}

/** Whether a match should be included in the smart ESPN poll window. */
export function shouldPollMatch(match: FifaMatchForSync, now: Date): boolean {
  const status = match.status || 'upcoming'
  if (status === 'void') return false
  if (status === 'live') return true
  if (status === 'finished' && !match.settled) return true

  if (!match.kickoff_at) return false
  const kickoff = new Date(match.kickoff_at)
  if (isNaN(kickoff.getTime())) return false

  const twoHoursMs = 2 * 60 * 60 * 1000
  return Math.abs(now.getTime() - kickoff.getTime()) <= twoHoursMs
}

/** Build settlement fields from ESPN final score (respects home/away orientation). */
export function buildSettlePayload(
  match: FifaMatchForSync,
  espnEvent: EspnSyncEvent,
): SettlePayload {
  const mh = normalizeTeamName(match.team_home)
  const ma = normalizeTeamName(match.team_away)
  const eh = normalizeTeamName(espnEvent.homeTeam)
  const ea = normalizeTeamName(espnEvent.awayTeam)

  let homeGoals = espnEvent.homeGoals ?? 0
  let awayGoals = espnEvent.awayGoals ?? 0
  if (mh === ea && ma === eh) {
    homeGoals = espnEvent.awayGoals ?? 0
    awayGoals = espnEvent.homeGoals ?? 0
  }

  let result_winner: 'home' | 'away' | 'draw'
  if (homeGoals > awayGoals) result_winner = 'home'
  else if (awayGoals > homeGoals) result_winner = 'away'
  else result_winner = 'draw'

  return {
    result_winner,
    result_home_goals: homeGoals,
    result_away_goals: awayGoals,
    result_scorers: [],
    result_yellow_cards: 0,
    result_red_cards: 0,
    result_home_clean_sheet: awayGoals === 0,
    result_away_clean_sheet: homeGoals === 0,
    // Knockout 90-min draw: winner=draw, advance left empty for admin.
    result_advance: result_winner !== 'draw' ? result_winner : '',
  }
}

/** Compute auto_settle_at ISO timestamp after FT. */
export function computeAutoSettleAt(
  now: Date,
  settleDelayMinutes: number,
): string {
  const delayMs = Math.max(0, settleDelayMinutes) * 60 * 1000
  return new Date(now.getTime() + delayMs).toISOString()
}

/** Whether cron should invoke internal settle for this match. */
export function shouldAutoSettle(
  match: FifaMatchForSync,
  settings: FifaSettingsForSync,
  now: Date,
): boolean {
  if (!settings.auto_settle_enabled) return false
  if (match.status !== 'finished') return false
  if (match.settled) return false
  if (!match.auto_settle_at) return false

  const settleAt = new Date(match.auto_settle_at)
  if (isNaN(settleAt.getTime()) || settleAt > now) return false

  if (!match.result_winner) return false
  if (match.result_home_goals === undefined || match.result_away_goals === undefined) {
    return false
  }

  // Knockout 90-min draw without advance — admin must fill result_advance.
  if (match.result_winner === 'draw' && !match.result_advance) return false

  return true
}

/** Idempotency guard — already-settled matches must not re-settle. */
export function shouldSkipSettle(match: Pick<FifaMatchForSync, 'settled'>): boolean {
  return Boolean(match.settled)
}

function numOrZero(v: unknown): number {
  if (typeof v === 'number' && !isNaN(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v)
  return 0
}