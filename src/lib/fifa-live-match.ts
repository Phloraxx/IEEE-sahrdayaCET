export interface LiveScoreMatch {
  id?: string
  homeTeam: string
  awayTeam: string
  homeGoals: number | null
  awayGoals: number | null
  status: string
  minute?: number | null
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