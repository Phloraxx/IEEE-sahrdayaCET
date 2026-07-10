import { normalizeTeamName } from '@/lib/fifa-team-names'

// Multi-source WC 2026 live scores + fixtures (FIFA-GAME.md §2.7).
//
// Three sources, tried in priority order, mirroring the emrbli/worldcup
// project's proven strategy:
//
//   1. ESPN hidden API (site.api.espn.com) — PRIMARY for live scores.
//      No auth, real-time, rich data (scores, events, cards, lineups).
//      Used by the emrbli project as its primary live source.
//
//   2. football-data.org — FALLBACK for scores + fixtures.
//      Free tier (10 req/min, WC included, scores ~30-60s delayed).
//      Requires FOOTBALL_DATA_API_TOKEN. Stable (13 yrs), permanent free.
//
//   3. openfootball GitHub JSON — STATIC BACKBONE for fixture import.
//      Complete 104-match WC 2026 list, no auth, no rate limits, static.
//      Includes ET/penalty scores. The canonical backbone emrbli uses.
//
// All sources are optional. If none are reachable, the UI hides the overlay
// gracefully — the game works without live scores.

const CACHE_TTL_MS = 60_000
const ERROR_CACHE_TTL_MS = 10_000
const FD_BASE = 'https://api.football-data.org/v4'
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'
// World Cup 2026 league tag on ESPN. The emrbli project uses fifa.world
// but the qualifying tag is fifa.worldq.* — the tournament tag flips to
// fifa.world once the group stage kicks off. We try both.
const ESPN_LEAGUES = ['fifa.world', 'fifa.worldq.uefa', 'fifa.worldq.conmebol']
// openfootball static JSON — complete 104-match WC 2026 fixture list.
const OPENFOOTBALL_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json'

export interface LiveMatch {
  id: string
  homeTeam: string
  awayTeam: string
  homeGoals: number | null
  awayGoals: number | null
  status: 'SCHEDULED' | 'IN_PLAY' | 'PAUSED' | 'FINISHED' | 'AWARDED' | 'SUSPENDED' | 'POSTPONED' | 'CANCELLED' | 'UNKNOWN'
  minute: number | null
  kickoffAt: string | null
  stage: string | null
  /** Did this match go to extra time / penalties? (openfootball only) */
  afterExtraTime?: boolean
  afterPenalties?: boolean
  /** Penalty shootout score (openfootball only) */
  pensHome?: number | null
  pensAway?: number | null
}

export interface LiveScoresResult {
  matches: LiveMatch[]
  configured: boolean
  fetchedAt: number
  /** Which source provided the data (for debugging / admin display). */
  source: 'espn' | 'football-data' | 'openfootball' | 'none'
}

let _cache: { result: LiveScoresResult; expiresAt: number } | null = null

export function isLiveScoresConfigured(): boolean {
  // Always "configured" now — at least the openfootball static source works
  // with zero setup. The UI shows the overlay whenever we have data.
  return true
}

/** Fetch WC 2026 live scores with a 60s in-memory cache. Tries sources in
 *  priority order: ESPN (real-time) → football-data.org (delayed) →
 *  openfootball (static, always works). Returns the first successful source. */
export async function getLiveScores(): Promise<LiveScoresResult> {
  if (_cache && _cache.expiresAt > Date.now()) {
    return _cache.result
  }

  // 1. Try ESPN (real-time, no auth) — best for live matches.
  try {
    const espn = await fetchFromEspn()
    if (espn.matches.length > 0) {
      const result: LiveScoresResult = { ...espn, source: 'espn', configured: true, fetchedAt: Date.now() }
      _cache = { result, expiresAt: Date.now() + CACHE_TTL_MS }
      return result
    }
  } catch (err) {
    console.error('[fifa-live] ESPN fetch failed:', err instanceof Error ? err.message : String(err))
  }

  // 2. Try football-data.org (delayed scores, needs token).
  if (process.env.FOOTBALL_DATA_API_TOKEN) {
    try {
      const fd = await fetchFromFootballData()
      if (fd.matches.length > 0) {
        const result: LiveScoresResult = { ...fd, source: 'football-data', configured: true, fetchedAt: Date.now() }
        _cache = { result, expiresAt: Date.now() + CACHE_TTL_MS }
        return result
      }
    } catch (err) {
      console.error('[fifa-live] football-data.org fetch failed:', err instanceof Error ? err.message : String(err))
    }
  }

  // 3. Fallback: openfootball static JSON (always works, has all 104 matches
  //    with scores once played). Not real-time, but complete.
  try {
    const of = await fetchFromOpenfootball()
    const result: LiveScoresResult = { matches: of, source: 'openfootball', configured: true, fetchedAt: Date.now() }
    _cache = { result, expiresAt: Date.now() + CACHE_TTL_MS }
    return result
  } catch (err) {
    console.error('[fifa-live] openfootball fetch failed:', err instanceof Error ? err.message : String(err))
  }

  // All sources failed — return empty with a short error cache.
  const result: LiveScoresResult = { matches: [], configured: false, fetchedAt: Date.now(), source: 'none' }
  _cache = { result, expiresAt: Date.now() + ERROR_CACHE_TTL_MS }
  return result
}

// ─── ESPN (hidden API, no auth, real-time) ──────────────────────────

async function fetchFromEspn(): Promise<{ matches: LiveMatch[] }> {
  // ESPN's soccer scoreboard endpoint. Try the WC tournament tag, then
  // qualifying tags. Returns events with live scores, status, and details.
  for (const league of ESPN_LEAGUES) {
    try {
      const url = `${ESPN_BASE}/${league}/scoreboard`
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
      if (!res.ok) continue
      const data = await res.json() as { events?: unknown[] }
      const events = Array.isArray(data.events) ? data.events : []
      if (events.length === 0) continue
      const matches = events.map((e) => normalizeEspnEvent(e)).filter(Boolean) as LiveMatch[]
      if (matches.length > 0) return { matches }
    } catch {
      continue // try next league tag
    }
  }
  return { matches: [] }
}

export function normalizeEspnEvent(e: unknown): LiveMatch | null {
  const rec = (e && typeof e === 'object') ? e as Record<string, unknown> : {}
  const competitions = Array.isArray(rec.competitions) ? rec.competitions : []
  const comp = competitions[0]
  if (!comp || typeof comp !== 'object') return null
  const compRec = comp as Record<string, unknown>
  const competitors = Array.isArray(compRec.competitors) ? compRec.competitors : []
  if (competitors.length < 2) return null
  const home = competitors.find((c) => (c as Record<string, unknown>).homeAway === 'home') as Record<string, unknown> | undefined
  const away = competitors.find((c) => (c as Record<string, unknown>).homeAway === 'away') as Record<string, unknown> | undefined
  if (!home || !away) return null
  const homeTeam = (home.team as Record<string, unknown>) || {}
  const awayTeam = (away.team as Record<string, unknown>) || {}
  const status = (compRec.status as Record<string, unknown>) || {}
  const statusType = (status.type as Record<string, unknown>) || {}
  const espnState = String(statusType.state || 'pre') // pre | in | post
  const mappedStatus = espnState === 'in' ? 'IN_PLAY' : espnState === 'post' ? 'FINISHED' : 'SCHEDULED'
  const clock = status.clock
  const minute = typeof clock === 'number' ? Math.floor(clock / 60) : null
  return {
    id: String(rec.id || ''),
    homeTeam: String(homeTeam.displayName || homeTeam.name || homeTeam.abbreviation || ''),
    awayTeam: String(awayTeam.displayName || awayTeam.name || awayTeam.abbreviation || ''),
    homeGoals: mappedStatus === 'SCHEDULED' ? null : numOrNull(home.score),
    awayGoals: mappedStatus === 'SCHEDULED' ? null : numOrNull(away.score),
    status: mappedStatus as LiveMatch['status'],
    minute,
    kickoffAt: String(rec.date || compRec.date || '') || null,
    stage: null,
  }
}

// ─── football-data.org (free token, delayed scores) ─────────────────

async function fetchFromFootballData(): Promise<{ matches: LiveMatch[] }> {
  const token = process.env.FOOTBALL_DATA_API_TOKEN!
  const url = `${FD_BASE}/competitions/WC/matches?season=2026&status=SCHEDULED,LIVE,IN_PLAY,PAUSED,FINISHED`
  const res = await fetch(url, { headers: { 'X-Auth-Token': token } })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`football-data.org ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json() as { matches?: unknown[] }
  const raw = Array.isArray(data.matches) ? data.matches : []
  return { matches: raw.map((m) => normalizeFootballDataMatch(m)) }
}

function normalizeFootballDataMatch(m: unknown): LiveMatch {
  const rec = (m && typeof m === 'object') ? m as Record<string, unknown> : {}
  const home = (rec.homeTeam && typeof rec.homeTeam === 'object') ? rec.homeTeam as Record<string, unknown> : {}
  const away = (rec.awayTeam && typeof rec.awayTeam === 'object') ? rec.awayTeam as Record<string, unknown> : {}
  const score = (rec.score && typeof rec.score === 'object') ? rec.score as Record<string, unknown> : {}
  const fullTime = (score.fullTime && typeof score.fullTime === 'object') ? score.fullTime as Record<string, unknown> : {}
  const halfTime = (score.halfTime && typeof score.halfTime === 'object') ? score.halfTime as Record<string, unknown> : {}
  const homeName = String(home.shortName || home.name || home.tla || '')
  const awayName = String(away.shortName || away.name || away.tla || '')
  const homeGoals = numOrNull(fullTime.home)
  const awayGoals = numOrNull(fullTime.away)
  const liveHome = homeGoals ?? numOrNull(halfTime.home) ?? 0
  const liveAway = awayGoals ?? numOrNull(halfTime.away) ?? 0
  const status = String(rec.status || 'UNKNOWN') as LiveMatch['status']
  return {
    id: String(rec.id || ''),
    homeTeam: homeName,
    awayTeam: awayName,
    homeGoals: status === 'SCHEDULED' ? null : (homeGoals ?? liveHome),
    awayGoals: status === 'SCHEDULED' ? null : (awayGoals ?? liveAway),
    status,
    minute: numOrNull(rec.minute),
    kickoffAt: String(rec.utcDate || rec.startDate || '') || null,
    stage: String(rec.stage || rec.group || '') || null,
  }
}

// ─── openfootball (static JSON, complete 104-match list) ────────────

async function fetchFromOpenfootball(): Promise<LiveMatch[]> {
  const res = await fetch(OPENFOOTBALL_URL)
  if (!res.ok) {
    throw new Error(`openfootball ${res.status}`)
  }
  const data = await res.json() as { matches?: unknown[] }
  const raw = Array.isArray(data.matches) ? data.matches : []
  return raw.map((m) => normalizeOpenfootballMatch(m))
}

function normalizeOpenfootballMatch(m: unknown): LiveMatch {
  const rec = (m && typeof m === 'object') ? m as Record<string, unknown> : {}
  const score = (rec.score && typeof rec.score === 'object') ? rec.score as Record<string, unknown> : {}
  const ft = Array.isArray(score.ft) ? score.ft as number[] : [0, 0]
  const hasScore = !!score.ft
  // openfootball rounds: "Matchday N", "Round of 32", "Round of 16",
  // "Quarter-final", "Semi-final", "Match for third place", "Final".
  const round = String(rec.round || '')
  // Determine status: if score.ft exists, it's finished; otherwise scheduled.
  const status: LiveMatch['status'] = hasScore ? 'FINISHED' : 'SCHEDULED'
  // Parse the date + time fields. openfootball uses "2026-06-11" + "13:00 UTC-6".
  const dateStr = String(rec.date || '')
  const timeStr = String(rec.time || '')
  // Build an ISO-ish kickoff string (best-effort — openfootball times have
  // timezone offsets like "UTC-6", not ISO format).
  let kickoffAt: string | null = null
  if (dateStr) {
    const utcOffsetMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*UTC([+-]?\d+)/)
    if (utcOffsetMatch) {
      const hours = parseInt(utcOffsetMatch[1] ?? '0', 10)
      const mins = parseInt(utcOffsetMatch[2] ?? '0', 10)
      const offsetHours = parseInt(utcOffsetMatch[3] ?? '0', 10)
      const utcMs = Date.UTC(
        parseInt(dateStr.slice(0, 4), 10),
        parseInt(dateStr.slice(5, 7), 10) - 1,
        parseInt(dateStr.slice(8, 10), 10),
        hours - offsetHours,
        mins,
      )
      kickoffAt = new Date(utcMs).toISOString()
    } else {
      const cleanTime = timeStr.replace(/\s*UTC.*$/i, '').trim() || '12:00'
      kickoffAt = `${dateStr}T${cleanTime}:00.000Z`
    }
  }
  // ET / penalties: openfootball uses score.et and score.p arrays.
  const hasEt = !!score.et
  const hasPens = !!score.p
  const pens = Array.isArray(score.p) ? score.p as number[] : [0, 0]
  return {
    id: String(rec.num || `${rec.team1}-${rec.team2}-${dateStr}`),
    homeTeam: String(rec.team1 || ''),
    awayTeam: String(rec.team2 || ''),
    homeGoals: hasScore ? (ft[0] ?? 0) : null,
    awayGoals: hasScore ? (ft[1] ?? 0) : null,
    status,
    minute: null, // openfootball is static — no live minute
    kickoffAt,
    stage: round,
    afterExtraTime: hasEt,
    afterPenalties: hasPens,
    pensHome: hasPens ? (pens[0] ?? null) : null,
    pensAway: hasPens ? (pens[1] ?? null) : null,
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function numOrNull(v: unknown): number | null {
  if (typeof v === 'number' && !isNaN(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v)
  return null
}

/** Find a live match for a given team pairing, matching case-insensitively on
 *  team names. Returns null if no match. Used by the UI overlay. */
export function findLiveMatch(
  live: LiveMatch[],
  teamHome: string,
  teamAway: string,
): LiveMatch | null {
  const h = normalizeTeamName(teamHome)
  const a = normalizeTeamName(teamAway)
  return live.find((m) => {
    const mh = normalizeTeamName(m.homeTeam)
    const ma = normalizeTeamName(m.awayTeam)
    return (mh === h && ma === a) || (mh === a && ma === h)
  }) || null
}

/** Fetch WC fixtures for the admin "import fixtures" button.
 *  Uses openfootball (complete 104-match list, no auth, no limits) as the
 *  primary source, falling back to football-data.org if openfootball is down.
 *  Not cached — one-shot admin action. */
export async function getScheduledFixtures(): Promise<LiveScoresResult> {
  // openfootball has the complete fixture list — use it first.
  try {
    const of = await fetchFromOpenfootball()
    // Filter to upcoming (no score yet) + knockout stages only (the game is
    // knockout-only — skip group stage).
    const knockoutStages = ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Match for third place', 'Final']
    const fixtures = of.filter((m) => m.status === 'SCHEDULED' && knockoutStages.includes(m.stage || ''))
    if (fixtures.length > 0) {
      return { matches: fixtures, configured: true, fetchedAt: Date.now(), source: 'openfootball' }
    }
  } catch (err) {
    console.error('[fifa-live] openfootball fixtures failed:', err instanceof Error ? err.message : String(err))
  }

  // Fallback: football-data.org scheduled matches.
  if (process.env.FOOTBALL_DATA_API_TOKEN) {
    try {
      const token = process.env.FOOTBALL_DATA_API_TOKEN!
      const url = `${FD_BASE}/competitions/WC/matches?season=2026&status=SCHEDULED`
      const res = await fetch(url, { headers: { 'X-Auth-Token': token } })
      if (res.ok) {
        const data = await res.json() as { matches?: unknown[] }
        const raw = Array.isArray(data.matches) ? data.matches : []
        return { matches: raw.map((m) => normalizeFootballDataMatch(m)), configured: true, fetchedAt: Date.now(), source: 'football-data' }
      }
    } catch (err) {
      console.error('[fifa-live] football-data.org fixtures failed:', err instanceof Error ? err.message : String(err))
    }
  }

  return { matches: [], configured: false, fetchedAt: Date.now(), source: 'none' }
}