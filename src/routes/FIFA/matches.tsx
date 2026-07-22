import { Outlet, useLocation } from "react-router";
import { useQuery } from '@tanstack/react-query'
import { FifaLayout } from '@/features/fifa/fifa-layout'
import { FifaMatchCard, FifaMatchCardSkeleton } from '@/features/fifa/fifa-match-card'
import { findLiveMatch, isLiveStatus } from '@/lib/fifa-live-match'
import { filterPublicActiveFifaMatches } from '@/lib/fifa-match-filters'

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

export default function MatchesPage() {
  const { pathname } = useLocation()
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

  const matches = filterPublicActiveFifaMatches(data?.matches || [])
  const liveMatches = liveData?.matches || []
  const liveConfigured = liveData?.configured ?? false

  const live = matches.filter(m => {
    const lm = liveConfigured ? findLiveMatch(m.team_home, m.team_away, liveMatches) : null
    return m.status === 'live' || (lm && isLiveStatus(lm.status))
  })
  
  const upcoming = matches.filter((m) => !live.includes(m) && m.status === 'upcoming')

  return (
    <FifaLayout active="matches">
      <div className="w-full flex-1 flex flex-col">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-4 md:py-6">
          
          <div className="mb-10 text-center md:text-left">
            <h1 className="font-display text-4xl sm:text-5xl text-ieee-light-blue uppercase tracking-tight mb-3">
              Matches
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground max-w-2xl">
              All active fixtures. Select a match to view open markets and place your bets.
            </p>
          </div>

          {isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <FifaMatchCardSkeleton key={i} className="!w-full" />
              ))}
            </div>
          )}

          {!isLoading && matches.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed border-border bg-card/50">
              <span className="text-4xl mb-4 opacity-50">⚽</span>
              <h3 className="font-display text-xl uppercase mb-2">No Matches Yet</h3>
              <p className="text-muted-foreground text-sm max-w-sm">There are currently no active fixtures. Check back closer to kickoff!</p>
            </div>
          )}

          {!isLoading && matches.length > 0 && (
            <div className="space-y-12">
              
              {/* LIVE SECTION */}
              {live.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-6 border-b border-border pb-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-ieee-danger animate-pulse" />
                    <h2 className="font-display text-2xl uppercase tracking-wider text-foreground">Live Now</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {live.map((m) => (
                      <FifaMatchCard
                        key={m.id}
                        match={m}
                        liveMatches={liveMatches}
                        liveConfigured={liveConfigured}
                        className="!w-full"
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* UPCOMING SECTION */}
              {upcoming.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-6 border-b border-border pb-2">
                    <h2 className="font-display text-2xl uppercase tracking-wider text-foreground">Upcoming</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {upcoming.map((m) => (
                      <FifaMatchCard
                        key={m.id}
                        match={m}
                        liveMatches={liveMatches}
                        liveConfigured={liveConfigured}
                        className="!w-full"
                      />
                    ))}
                  </div>
                </section>
              )}


            </div>
          )}

        </div>
      </div>
    </FifaLayout>
  )
}