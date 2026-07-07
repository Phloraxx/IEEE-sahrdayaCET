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
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      </div>
    </FifaLayout>
  )
}

function MatchCard({ match }: { match: MatchData }) {
  const kickoff = new Date(match.kickoff_at)
  const isLive = match.status === 'live'
  const isFinished = match.status === 'finished' || match.settled
  const openMarkets = match.markets.filter((m) => m.is_open && !m.void)

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
      <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground">
        <span>{kickoff.toLocaleString()}</span>
        {openMarkets.length > 0 && (
          <span className="text-ieee-light-blue font-medium">{openMarkets.length} open markets →</span>
        )}
      </div>
    </Link>
  )
}
