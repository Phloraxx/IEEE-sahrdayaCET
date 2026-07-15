/** Shared filters for public FIFA match lists (hero, carousel, matches page). */

export interface FifaMatchListItem {
  status: string
  team_home: string
  kickoff_at?: string
}

export function isTestFifaMatch(teamHome: string): boolean {
  return teamHome.toLowerCase().startsWith('test')
}

/** True when PB status is upcoming or live (betting-relevant fixtures). */
export function isUpcomingOrLiveMatch(match: Pick<FifaMatchListItem, 'status'>): boolean {
  return match.status === 'upcoming' || match.status === 'live'
}

/** Public, non-test fixtures that are still open for betting or in play. */
export function isPublicActiveFifaMatch(match: FifaMatchListItem): boolean {
  if (isTestFifaMatch(match.team_home)) return false
  return isUpcomingOrLiveMatch(match)
}

export function filterPublicActiveFifaMatches<T extends FifaMatchListItem>(matches: T[]): T[] {
  return matches.filter(isPublicActiveFifaMatch)
}