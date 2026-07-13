// Resolve full-bleed match card backgrounds from ESPN's public summary API.
// Picks promo-style images (video thumbnails, article photos) for each fixture.

import { espnScoreboardDateParam } from '@/lib/fifa-espn-sync'
import { normalizeTeamName, teamNamesMatch } from '@/lib/fifa-team-names'
import { normalizeTeamDisplayName, teamShortName } from '@/lib/fifa-assets'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const ERROR_CACHE_TTL_MS = 5 * 60 * 1000

export interface MatchBackground {
  imageUrl: string
  position: string
  source: 'espn-summary' | 'fallback'
}

interface CacheEntry {
  value: MatchBackground | null
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

function cacheGet(key: string): MatchBackground | null | undefined {
  const hit = cache.get(key)
  if (!hit) return undefined
  if (Date.now() > hit.expiresAt) {
    cache.delete(key)
    return undefined
  }
  return hit.value
}

function cacheSet(key: string, value: MatchBackground | null, ttl = CACHE_TTL_MS) {
  cache.set(key, { value, expiresAt: Date.now() + ttl })
}

function teamTokens(team: string): string[] {
  const full = normalizeTeamDisplayName(team)
  const norm = normalizeTeamName(full)
  const short = teamShortName(full).toLowerCase()
  const tokens = new Set([norm, short, full.toLowerCase()])
  if (full === 'United States') tokens.add('usmnt')
  return [...tokens].filter(Boolean)
}

/** Score how relevant a headline/thumbnail path is to a fixture. */
export function scoreMatchImageText(text: string, home: string, away: string): number {
  const hay = text.toLowerCase().replace(/_/g, ' ')
  const homeTokens = teamTokens(home)
  const awayTokens = teamTokens(away)
  let score = 0

  const homeHit = homeTokens.some((t) => hay.includes(t))
  const awayHit = awayTokens.some((t) => hay.includes(t))
  if (homeHit) score += 3
  if (awayHit) score += 3
  if (homeHit && awayHit) score += 5
  if (hay.includes(' vs ') || hay.includes(' v ')) score += 2
  if (hay.includes('semifinal') || hay.includes('quarter') || hay.includes('world cup')) score += 1

  return score
}

interface ImageCandidate {
  url: string
  score: number
  width: number
}

function collectCandidatesFromSummary(
  summary: Record<string, unknown>,
  home: string,
  away: string,
): ImageCandidate[] {
  const out: ImageCandidate[] = []

  const videos = Array.isArray(summary.videos) ? summary.videos : []
  for (const raw of videos) {
    if (!raw || typeof raw !== 'object') continue
    const video = raw as Record<string, unknown>
    const thumb = typeof video.thumbnail === 'string' ? video.thumbnail : ''
    const headline = typeof video.headline === 'string' ? video.headline : ''
    const description = typeof video.description === 'string' ? video.description : ''
    if (!thumb) continue
    const text = `${headline} ${description} ${thumb}`
    out.push({ url: thumb, score: scoreMatchImageText(text, home, away) + 2, width: 1280 })
  }

  const articles = (summary.news as Record<string, unknown> | undefined)?.articles
  if (Array.isArray(articles)) {
    for (const raw of articles) {
      if (!raw || typeof raw !== 'object') continue
      const article = raw as Record<string, unknown>
      const headline = typeof article.headline === 'string' ? article.headline : ''
      const images = Array.isArray(article.images) ? article.images : []
      for (const imgRaw of images) {
        if (!imgRaw || typeof imgRaw !== 'object') continue
        const img = imgRaw as Record<string, unknown>
        const url = typeof img.url === 'string' ? img.url : ''
        const width = Number(img.width) || 0
        if (!url || !url.startsWith('https://')) continue
        if (url.includes('/headshots/') || url.includes('/teamlogos/')) continue
        out.push({
          url,
          score: scoreMatchImageText(`${headline} ${url}`, home, away),
          width,
        })
      }
    }
  }

  return out
}

export function pickBestBackgroundCandidate(
  candidates: ImageCandidate[],
  minScore = 4,
): MatchBackground | null {
  const ranked = [...candidates]
    .filter((c) => c.score >= minScore)
    .sort((a, b) => b.score - a.score || b.width - a.width)

  const best = ranked[0]
  if (!best) return null
  return {
    imageUrl: best.url,
    position: '50% 35%',
    source: 'espn-summary',
  }
}

async function fetchEspnSummary(eventId: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${ESPN_BASE}/fifa.world/summary?event=${eventId}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null
  } catch {
    return null
  }
}

async function lookupEspnEventId(
  home: string,
  away: string,
  kickoffAt?: string,
): Promise<string | null> {
  const dates = new Set<string>()
  if (kickoffAt) {
    const param = espnScoreboardDateParam(kickoffAt)
    if (param) dates.add(param)
  }
  const today = espnScoreboardDateParam(new Date())
  if (today) dates.add(today)

  for (const dateParam of dates) {
    try {
      const res = await fetch(`${ESPN_BASE}/fifa.world/scoreboard?dates=${dateParam}`, {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) continue
      const data = (await res.json()) as { events?: unknown[] }
      const events = Array.isArray(data.events) ? data.events : []
      for (const raw of events) {
        if (!raw || typeof raw !== 'object') continue
        const event = raw as Record<string, unknown>
        const id = String(event.id || '')
        const competitions = Array.isArray(event.competitions) ? event.competitions : []
        const comp = competitions[0]
        if (!comp || typeof comp !== 'object') continue
        const competitors = Array.isArray((comp as Record<string, unknown>).competitors)
          ? (comp as Record<string, unknown>).competitors as unknown[]
          : []
        let eventHome = ''
        let eventAway = ''
        for (const cRaw of competitors) {
          if (!cRaw || typeof cRaw !== 'object') continue
          const c = cRaw as Record<string, unknown>
          const teamObj = (c.team as Record<string, unknown>) || {}
          const name = String(teamObj.displayName || teamObj.name || '')
          if (c.homeAway === 'home') eventHome = name
          if (c.homeAway === 'away') eventAway = name
        }
        if (id && teamNamesMatch(home, eventHome) && teamNamesMatch(away, eventAway)) return id
        if (id && teamNamesMatch(home, eventAway) && teamNamesMatch(away, eventHome)) return id
      }
    } catch {
      continue
    }
  }
  return null
}

export async function resolveMatchBackground(input: {
  team_home: string
  team_away: string
  kickoff_at?: string
  espnId?: string | null
}): Promise<MatchBackground | null> {
  let espnId = input.espnId?.trim() || ''
  if (!espnId) {
    espnId = (await lookupEspnEventId(input.team_home, input.team_away, input.kickoff_at)) || ''
  }
  if (!espnId) return null

  const cacheKey = `espn:${espnId}`
  const cached = cacheGet(cacheKey)
  if (cached !== undefined) return cached

  const summary = await fetchEspnSummary(espnId)
  if (!summary) {
    cacheSet(cacheKey, null, ERROR_CACHE_TTL_MS)
    return null
  }

  const candidates = collectCandidatesFromSummary(summary, input.team_home, input.team_away)
  const picked = pickBestBackgroundCandidate(candidates)
  cacheSet(cacheKey, picked, picked ? CACHE_TTL_MS : ERROR_CACHE_TTL_MS)
  return picked
}