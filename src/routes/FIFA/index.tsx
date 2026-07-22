import { useLoaderData } from 'react-router'
import { fetchOverview } from '@/server/public/fifa-overview.server'
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

export const meta = () => [
  { title: "WC Predict '26 · IEEE Sahrdaya SB" },
  { name: "description", content: "Free-to-enter FIFA World Cup prediction game. Bet fake tickets, climb the leaderboard, win a sponsor voucher." },
];
export async function loader(): Promise<OverviewData> { return fetchOverview(); }

export default function FifaOverviewPage() {
  const data = useLoaderData<typeof loader>()

  return (
    <FifaLayout active="home">
      <FifaHero
        nextMatch={data.nextMatch}
        startingBalance={data.starting_balance}
        prize={data.prize || undefined}
      />
      <FifaMatchCarousel />
      <FifaStatsStrip playerCount={data.playerCount} totalBets={data.totalBets} />
      <FifaHowItWorks 
        startingBalance={data.starting_balance}
        maxBetPercent={data.max_bet_percent}
        raffleMinBets={data.raffle_active_participant_min_bets}
      />
      <FifaLeaderboardPreview />
      <FifaCtaBand />
    </FifaLayout>
  )
}