import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { createPB } from '@/lib/pb.server'
import { escapeFilterValue } from '@/lib/pb'
import { getField } from '@/lib/safe-get'
import { FifaLayout } from '@/features/fifa/fifa-layout'
import { FifaHero } from '@/features/fifa/fifa-hero'
import { FifaMatchCarousel } from '@/features/fifa/fifa-match-carousel'
import { FifaStatsStrip } from '@/features/fifa/fifa-stats-strip'
import { FifaHowItWorks } from '@/features/fifa/fifa-how-it-works'
import { FifaLeaderboardPreview } from '@/features/fifa/fifa-leaderboard-preview'
import { FifaCtaBand } from '@/features/fifa/fifa-cta-band'

interface OverviewData {
  prize: string
  starting_balance: number
  nextMatch: {
    id: string
    team_home: string
    team_away: string
    stage: string
    kickoff_at: string
    status: string
    openMarkets: number
  } | null
  playerCount: number
  totalBets: number
}

const fetchOverview = createServerFn().handler(async (): Promise<OverviewData> => {
  const pb = createPB()
  let settings = { prize: '', starting_balance: 1000 }
  try {
    const s = await pb.collection('fifa_settings').getFirstListItem('1=1')
    settings = {
      prize: getField(s, 'prize', ''),
      starting_balance: Number(getField(s, 'starting_balance', 1000)) || 1000,
    }
  } catch { /* not seeded yet */ }

  let nextMatch: OverviewData['nextMatch'] = null
  try {
    const upcoming = await pb.collection('fifa_matches').getFullList({
      filter: '(status = "upcoming" || status = "live") && status != "void"',
      sort: 'kickoff_at',
      fields: 'id,team_home,team_away,stage,kickoff_at,status',
      perPage: 50,
    })
    // Skip test matches created by the admin testing console (team_home
    // starts with "Test"). At ~20 rows this client-side filter is cheap.
    const realMatch = upcoming.find((mu) => {
      const h = String(getField(mu, 'team_home', '')).toLowerCase()
      return !h.startsWith('test')
    })
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

  let playerCount = 0
  let totalBets = 0
  try {
    const pbUrl = (process.env.POCKETBASE_URL || 'http://127.0.0.1:8090').replace(/\/+$/, '')
    const statsRes = await fetch(`${pbUrl}/api/fifa/stats`)
    if (statsRes.ok) {
      const stats = await statsRes.json() as { playerCount?: number; totalBets?: number }
      playerCount = Number(stats.playerCount) || 0
      totalBets = Number(stats.totalBets) || 0
    }
  } catch { /* ignore */ }

  return { ...settings, nextMatch, playerCount, totalBets }
})

export const Route = createFileRoute('/FIFA/')({
  head: () => ({
    meta: [
      { title: "WC Predict '26 · IEEE Sahrdaya SB" },
      {
        name: 'description',
        content:
          'Free-to-enter FIFA World Cup prediction game. Bet fake points, climb the leaderboard, win a sponsor voucher.',
      },
    ],
  }),
  loader: () => fetchOverview(),
  component: FifaOverviewPage,
})

function FifaOverviewPage() {
  const data = Route.useLoaderData() as OverviewData

  return (
    <FifaLayout active="home">
      <FifaHero
        nextMatch={data.nextMatch}
        startingBalance={data.starting_balance}
        prize={data.prize || undefined}
      />
      <FifaMatchCarousel />
      <FifaStatsStrip playerCount={data.playerCount} totalBets={data.totalBets} />
      <FifaHowItWorks />
      <FifaLeaderboardPreview />
      <FifaCtaBand />
    </FifaLayout>
  )
}