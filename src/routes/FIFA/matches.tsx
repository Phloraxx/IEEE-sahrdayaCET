import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { FifaLayout } from '@/features/fifa/fifa-layout'
import { FifaMatchCard, FifaMatchCardSkeleton } from '@/features/fifa/fifa-match-card'

interface MatchData {
  id: string
  team_home: string
  team_away: string
  stage: string
  kickoff_at: string
  betting_locks_at: string
  status: string
  result_winner: string
  result_home_goals: number
  result_away_goals: number
  result_advance: string
  settled: boolean
  markets: Array<{
    id: string
    market_type: string
    mode: string
    line: number
    is_open: boolean
    void: boolean
    pool_total: number
  }>
}

async function fetchMatches(): Promise<{ matches: MatchData[] }> {
  const res = await fetch('/api/fifa/matches')
  if (!res.ok) throw new Error('Failed to load matches')
  return res.json()
}

async function fetchLiveScores(): Promise<{
  matches: Array<{
    id: string
    homeTeam: string
    awayTeam: string
    homeGoals: number | null
    awayGoals: number | null
    status: string
    minute: number | null
  }>
  configured: boolean
}> {
  const res = await fetch('/api/fifa/live-scores')
  if (!res.ok) return { matches: [], configured: false }
  return res.json()
}

export const Route = createFileRoute('/FIFA/matches')({
  head: () => ({ meta: [{ title: "Matches · WC Predict '26" }] }),
  component: MatchesPage,
})

function MatchesPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isDetail = /^\/FIFA\/matches\/[^/]+\/?$/.test(pathname)

  const { data, isLoading } = useQuery({
    queryKey: ['fifa-matches'],
    queryFn: fetchMatches,
    refetchInterval: 15_000,
    enabled: !isDetail,
  })

  const { data: liveData } = useQuery({
    queryKey: ['fifa-live-scores'],
    queryFn: fetchLiveScores,
    refetchInterval: 60_000,
    enabled: !isDetail,
  })

  if (isDetail) {
    return (
      <FifaLayout active="matches">
        <Outlet />
      </FifaLayout>
    )
  }

  return (
    <FifaLayout active="matches">
      <div className="px-[clamp(20px,4vw,48px)] py-8">
        <h1 className="font-display mb-2 text-[clamp(28px,4vw,38px)] text-ieee-light-blue uppercase">
          Matches
        </h1>
        <p className="mb-8 text-sm text-[#9a9aa2]">
          All fixtures with open markets. Tap a card to view markets and place a bet.
        </p>

        {isLoading && (
          <div className="flex flex-wrap gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <FifaMatchCardSkeleton key={i} />
            ))}
          </div>
        )}

        {!isLoading && (!data?.matches || data.matches.length === 0) && (
          <p className="text-[#9a9aa2]">No matches yet. Check back soon.</p>
        )}

        <div className="flex flex-wrap gap-4">
          {(data?.matches || []).map((m) => (
            <FifaMatchCard
              key={m.id}
              match={m}
              liveMatches={liveData?.matches ?? []}
              liveConfigured={liveData?.configured ?? false}
              className="max-w-none flex-1 min-[340px]:max-w-[302px]"
            />
          ))}
        </div>
      </div>
    </FifaLayout>
  )
}