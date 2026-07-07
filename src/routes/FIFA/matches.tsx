import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { FifaLayout } from '@/features/fifa/fifa-layout'

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

async function fetchLiveScores(): Promise<{ matches: Array<{ id: string; homeTeam: string; awayTeam: string; homeGoals: number | null; awayGoals: number | null; status: string; minute: number | null }>; configured: boolean }> {
  const res = await fetch('/api/fifa/live-scores')
  if (!res.ok) return { matches: [], configured: false }
  return res.json()
}

export const Route = createFileRoute('/FIFA/matches')({
  head: () => ({ meta: [{ title: "Matches · WC Predict '26" }] }),
  component: MatchesPage,
})

function MatchesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['fifa-matches'],
    queryFn: fetchMatches,
    refetchInterval: 15_000,
  })
  // Live scores overlay (60s poll, degrades gracefully if unconfigured).
  const { data: liveData } = useQuery({
    queryKey: ['fifa-live-scores'],
    queryFn: fetchLiveScores,
    refetchInterval: 60_000,
  })

  return (
    <FifaLayout active="matches">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="font-display text-3xl text-ieee-blue mb-6">Matches</h1>
        {isLoading && <p className="text-muted-foreground">Loading…</p>}
        {data?.matches.length === 0 && (
          <p className="text-muted-foreground">No matches yet. Check back soon.</p>
        )}
        <div className="space-y-3">
          {data?.matches.map((m) => (
            <MatchCard key={m.id} match={m} liveMatches={liveData?.matches || []} liveConfigured={liveData?.configured || false} />
          ))}
        </div>
      </div>
    </FifaLayout>
  )
}

function MatchCard({ match, liveMatches, liveConfigured }: { match: MatchData; liveMatches: Array<{ id: string; homeTeam: string; awayTeam: string; homeGoals: number | null; awayGoals: number | null; status: string; minute: number | null }>; liveConfigured: boolean }) {
  const kickoff = new Date(match.kickoff_at)
  const isLive = match.status === 'live'
  const isFinished = match.status === 'finished' || match.settled
  const openMarkets = match.markets.filter((m) => m.is_open && !m.void)

  // Live score overlay
  const liveMatch = liveConfigured
    ? liveMatches.find((lm) => {
        const h = lm.homeTeam.trim().toLowerCase()
        const a = lm.awayTeam.trim().toLowerCase()
        const mh = match.team_home.trim().toLowerCase()
        const ma = match.team_away.trim().toLowerCase()
        return (mh === h && ma === a) || (mh === a && ma === h)
      }) || null
    : null
  const showLiveScore = liveMatch && (liveMatch.status === 'IN_PLAY' || liveMatch.status === 'PAUSED')

  return (
    <Link
      to="/FIFA/matches/$id/"
      params={{ id: match.id }}
      className="block rounded-lg border border-border bg-card p-4 hover:border-ieee-light-blue transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {match.stage.toUpperCase()}
        </span>
        {isLive && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ieee-danger">
            <span className="h-1.5 w-1.5 rounded-full bg-ieee-danger animate-pulse" /> LIVE
          </span>
        )}
        {isFinished && (
          <span className="text-xs font-medium text-muted-foreground">Finished</span>
        )}
      </div>
      <p className="font-display text-xl text-foreground">
        {match.team_home} <span className="text-muted-foreground font-sans text-base">vs</span> {match.team_away}
      </p>
      {/* Live or finished score */}
      {(showLiveScore || isFinished) && (
        <p className="font-mono text-lg text-ieee-blue mt-1">
          {showLiveScore ? (liveMatch?.homeGoals ?? 0) : match.result_home_goals}
          {' - '}
          {showLiveScore ? (liveMatch?.awayGoals ?? 0) : match.result_away_goals}
          {showLiveScore && liveMatch?.minute && <span className="text-ieee-danger text-xs ml-2">'{liveMatch.minute}</span>}
        </p>
      )}
      <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground">
        <span>{kickoff.toLocaleString()}</span>
        {openMarkets.length > 0 && (
          <span className="text-ieee-light-blue font-medium">{openMarkets.length} open markets →</span>
        )}
      </div>
    </Link>
  )
}
