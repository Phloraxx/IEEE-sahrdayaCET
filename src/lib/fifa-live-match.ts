export interface LiveScoreMatch {
  id?: string
  homeTeam: string
  awayTeam: string
  homeGoals: number | null
  awayGoals: number | null
  status: string
  minute?: number | null
}

export interface FifaLiveScoresPayload {
  matches: LiveScoreMatch[]
  configured: boolean
}

export async function fetchFifaLiveScores(options?: { throwOnError?: boolean }): Promise<FifaLiveScoresPayload> {
  const response = await fetch('/api/fifa/live-scores')
  if (!response.ok) {
    if (options?.throwOnError) throw new Error('Live scores unavailable')
    return { matches: [], configured: false }
  }

  const raw = await response.json() as unknown
  if (!raw || typeof raw !== 'object') return { matches: [], configured: false }
  const payload = raw as { matches?: unknown; configured?: unknown }
  const matches = Array.isArray(payload.matches)
    ? payload.matches.flatMap((entry): LiveScoreMatch[] => {
        if (!entry || typeof entry !== 'object') return []
        const item = entry as Record<string, unknown>
        const homeTeam = typeof item.homeTeam === 'string' ? item.homeTeam : ''
        const awayTeam = typeof item.awayTeam === 'string' ? item.awayTeam : ''
        if (!homeTeam || !awayTeam) return []
        const numberOrNull = (value: unknown) =>
          typeof value === 'number' && Number.isFinite(value) ? value : null
        return [{
          id: typeof item.id === 'string' ? item.id : undefined,
          homeTeam,
          awayTeam,
          homeGoals: numberOrNull(item.homeGoals),
          awayGoals: numberOrNull(item.awayGoals),
          status: typeof item.status === 'string' ? item.status : '',
          minute: numberOrNull(item.minute),
        }]
      })
    : []
  return { matches, configured: payload.configured === true }
}

export function findLiveMatch(
  home: string,
  away: string,
  liveMatches: LiveScoreMatch[],
): LiveScoreMatch | null {
  const mh = home.trim().toLowerCase()
  const ma = away.trim().toLowerCase()
  return (
    liveMatches.find((lm) => {
      const h = lm.homeTeam.trim().toLowerCase()
      const a = lm.awayTeam.trim().toLowerCase()
      return (mh === h && ma === a) || (mh === a && ma === h)
    }) ?? null
  )
}

export function isLiveStatus(status: string): boolean {
  return status === 'IN_PLAY' || status === 'PAUSED'
}
