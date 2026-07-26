import { createPublicPB } from "@/lib/pb.server";
import { escapeFilterValue } from "@/lib/pb";
import { getField, getNumberField } from "@/lib/safe-get";
import { filterPublicActiveFifaMatches } from "@/lib/fifa-match-filters";

export interface OverviewData {
  prize: string
  starting_balance: number
  max_bet_percent: number
  raffle_active_participant_min_bets: number
  nextMatch: {
    id: string
    team_home: string
    team_away: string
    stage: string
    kickoff_at: string
    status: string
    openMarkets: number
  } | null
  playerCount: number | null
  totalBets: number | null
}

export async function fetchOverview(): Promise<OverviewData> {
  const pb = createPublicPB()
  let settings = { prize: '', starting_balance: 1000, max_bet_percent: 25, raffle_active_participant_min_bets: 5 }
  try {
    const s = await pb.collection('fifa_settings').getFirstListItem('1=1')
    settings = {
      prize: getField(s, 'prize', ''),
      starting_balance: getNumberField(s, 'starting_balance', 1000),
      max_bet_percent: getNumberField(s, 'max_bet_percent', 25),
      raffle_active_participant_min_bets: getNumberField(s, 'raffle_active_participant_min_bets', 5),
    }
  } catch { /* not seeded yet */ }

  let nextMatch: OverviewData['nextMatch'] = null
  try {
    const upcoming = await pb.collection('fifa_matches').getFullList({
      filter: '(status = "upcoming" || status = "live") && status != "void"',
      sort: 'kickoff_at',
      fields: 'id,team_home,team_away,stage,kickoff_at,status',
      batch: 100,
    })
    const active = filterPublicActiveFifaMatches(
      upcoming.map((mu) => ({
        ...mu,
        team_home: getField(mu, 'team_home', ''),
        status: getField(mu, 'status', 'upcoming'),
        kickoff_at: getField(mu, 'kickoff_at', ''),
      })),
    )
    const realMatch = active[0]
    if (realMatch) {
      const matchId = getField(realMatch, 'id', '')
      let openMarkets = 0
      try {
        const markets = await pb.collection('fifa_bet_markets').getFullList({
          filter: `match = ${escapeFilterValue(matchId)} && is_open = true && void = false`,
          fields: 'id',
        })
        openMarkets = markets.length
      } catch { /* ignore */ }
      nextMatch = {
        id: matchId,
        team_home: getField(realMatch, 'team_home', ''),
        team_away: getField(realMatch, 'team_away', ''),
        stage: getField(realMatch, 'stage', ''),
        kickoff_at: getField(realMatch, 'kickoff_at', ''),
        status: getField(realMatch, 'status', 'upcoming'),
        openMarkets,
      }
    }
  } catch { /* no upcoming matches */ }

  let playerCount: number | null = null
  let totalBets: number | null = null
  try {
    const stats = await pb.send('/api/fifa/stats', {}) as { playerCount?: number; totalBets?: number }
    if (typeof stats.playerCount === 'number') playerCount = stats.playerCount
    if (typeof stats.totalBets === 'number') totalBets = stats.totalBets
  } catch { /* ignore */ }

  return { ...settings, nextMatch, playerCount, totalBets }
}
