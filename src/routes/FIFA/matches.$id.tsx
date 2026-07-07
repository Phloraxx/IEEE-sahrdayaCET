import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createPB } from '@/lib/pb.server'
import { escapeFilterValue } from '@/lib/pb'
import { getField } from '@/lib/safe-get'
import { FifaLayout } from '@/features/fifa/fifa-layout'
import { useAuth } from '@/lib/auth-context'
import { usePbSubscription } from '@/hooks/use-pb-subscription'
import { toast } from 'sonner'
import { FIFA_MARKET_LABELS, FIFA_MARKET_BLURBS } from '@/schemas/fifa'

interface MatchDetail {
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
  result_after_extra_time: boolean
  result_after_penalties: boolean
  settled: boolean
  markets: Market[]
}

interface Market {
  id: string
  market_type: string
  mode: string
  line: number
  fixed_odds: Record<string, number> | null
  options: string[]
  is_open: boolean
  void: boolean
  pool_total: number
  pool_by_option: Record<string, number>
}

const fetchMatch = createServerFn()
  .validator((id: string) => id)
  .handler(async ({ data: id }): Promise<MatchDetail | null> => {
    const pb = createPB()
    try {
      const m = await pb.collection('fifa_matches').getOne(id, { fields: 'id,team_home,team_away,stage,kickoff_at,betting_locks_at,status,result_winner,result_home_goals,result_away_goals,result_advance,result_after_extra_time,result_after_penalties,settled' })
      const markets = await pb.collection('fifa_bet_markets').getFullList({
        filter: `match = ${escapeFilterValue(id)}`,
        fields: 'id,market_type,mode,line,fixed_odds,options,is_open,void,pool_total,pool_by_option',
      })
      return {
        id: getField(m, 'id', ''),
        team_home: getField(m, 'team_home', ''),
        team_away: getField(m, 'team_away', ''),
        stage: getField(m, 'stage', ''),
        kickoff_at: getField(m, 'kickoff_at', ''),
        betting_locks_at: getField(m, 'betting_locks_at', ''),
        status: getField(m, 'status', 'upcoming'),
        result_winner: getField(m, 'result_winner', ''),
        result_home_goals: getField(m, 'result_home_goals', 0),
        result_away_goals: getField(m, 'result_away_goals', 0),
        result_advance: getField(m, 'result_advance', ''),
        result_after_extra_time: getField(m, 'result_after_extra_time', false),
        result_after_penalties: getField(m, 'result_after_penalties', false),
        settled: getField(m, 'settled', false),
        markets: markets.map((mkt) => ({
          id: getField(mkt, 'id', ''),
          market_type: getField(mkt, 'market_type', ''),
          mode: getField(mkt, 'mode', 'pool'),
          line: getField(mkt, 'line', 0),
          fixed_odds: getField(mkt, 'fixed_odds', null),
          options: getField(mkt, 'options', []),
          is_open: getField(mkt, 'is_open', true),
          void: getField(mkt, 'void', false),
          pool_total: getField(mkt, 'pool_total', 0),
          pool_by_option: getField(mkt, 'pool_by_option', {}),
        })),
      }
    } catch {
      return null
    }
  })

export const Route = createFileRoute('/FIFA/matches/$id')({
  head: () => ({ meta: [{ title: "Match · WC Predict '26" }] }),
  loader: async ({ params }) => fetchMatch({ data: params.id }),
  component: MatchDetailPage,
})

function MatchDetailPage() {
  const loaderMatch = Route.useLoaderData()
  const { id: matchId } = Route.useParams()
  const { status, signIn } = useAuth()
  const queryClient = useQueryClient()

  // Use React Query for the match data, seeded with the SSR loader output
  // as initialData. This lets the SSE subscription update the query cache
  // and have the UI actually re-render with new pool totals.
  const { data: match } = useQuery({
    queryKey: ['fifa-match', matchId],
    initialData: loaderMatch,
    enabled: !!matchId,
  })

  // Live scores from football-data.org (polled every 60s). Gracefully
  // degrades to no overlay if the API token isn't configured.
  const { data: liveData } = useQuery({
    queryKey: ['fifa-live-scores'],
    queryFn: async () => {
      const res = await fetch('/api/fifa/live-scores')
      if (!res.ok) return { matches: [], configured: false }
      return res.json() as Promise<{ matches: Array<{ id: string; homeTeam: string; awayTeam: string; homeGoals: number | null; awayGoals: number | null; status: string; minute: number | null }>; configured: boolean }>
    },
    refetchInterval: 60_000,
  })
  const liveMatch = match && liveData?.configured
    ? liveData.matches.find((lm) => {
        const h = lm.homeTeam.trim().toLowerCase()
        const a = lm.awayTeam.trim().toLowerCase()
        const mh = match.team_home.trim().toLowerCase()
        const ma = match.team_away.trim().toLowerCase()
        return (mh === h && ma === a) || (mh === a && ma === h)
      }) || null
    : null

  // Fetch the user's balance + max_bet_percent so the betting slip can show
  // the 25% cap inline (FIFA-GAME.md §2.5).
  const { data: userBalance } = useQuery({
    queryKey: ['fifa-dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/fifa/dashboard')
      if (!res.ok) return null
      return res.json() as Promise<{ user: { balance: number } }>
    },
    enabled: status === 'authenticated',
    refetchInterval: 15_000,
  })
  const balance = userBalance?.user?.balance ?? 0
  const maxBet = Math.floor(balance * 25 / 100) // 25% cap — synced with settings.max_bet_percent

  // Live pool updates via SSE — subscribe to the match's markets collection
  // updates (pool_total/pool_by_option change when bets are placed).
  usePbSubscription('fifa_bet_markets', '*', (e) => {
    if (e.action === 'update' && match) {
      queryClient.setQueryData(['fifa-match', match.id], (old: MatchDetail | undefined) => {
        if (!old) return old
        return {
          ...old,
          markets: old.markets.map((m) =>
            m.id === (e.record as Record<string, unknown>).id
              ? { ...m, pool_total: Number(getField(e.record, 'pool_total', 0)), pool_by_option: getField(e.record, 'pool_by_option', {}) as Record<string, number> }
              : m
          ),
        }
      })
    }
  })

  if (!match) {
    return (
      <FifaLayout active="matches">
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <p className="text-muted-foreground">Match not found.</p>
          <Link to="/FIFA/matches/" className="text-ieee-light-blue hover:underline mt-4 inline-block">← Back to matches</Link>
        </div>
      </FifaLayout>
    )
  }

  const isLive = match.status === 'live' || (liveMatch && (liveMatch.status === 'IN_PLAY' || liveMatch.status === 'PAUSED'))
  const isFinished = match.status === 'finished' || match.settled
  const kickoff = new Date(match.kickoff_at)
  const betsLocked = match.betting_locks_at ? new Date(match.betting_locks_at) <= new Date() : kickoff <= new Date()
  const isKnockout = ['r32', 'r16', 'qf', 'sf', 'third_place', 'final'].includes(match.stage)

  // Live score overlay (from football-data.org). Falls back to the stored
  // result when the match is finished.
  const liveHomeGoals = liveMatch?.homeGoals ?? match.result_home_goals
  const liveAwayGoals = liveMatch?.awayGoals ?? match.result_away_goals
  const liveMinute = liveMatch?.minute

  return (
    <FifaLayout active="matches">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link to="/FIFA/matches/" className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">← All matches</Link>

        {/* Match hero */}
        <header className="mb-8 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
            {match.stage.toUpperCase()}
          </p>
          <h1 className="font-display text-4xl sm:text-5xl text-ieee-blue leading-[1.05]">
            {match.team_home}<br /><span className="text-2xl text-muted-foreground font-sans">vs</span><br />{match.team_away}
          </h1>
          <p className="text-sm text-muted-foreground mt-3">{kickoff.toLocaleString()}</p>

          {/* Live / finished score line */}
          {(isLive || isFinished) && (
            <p className="font-mono text-2xl text-foreground mt-2">
              {liveHomeGoals} - {liveAwayGoals}
              {isLive && liveMinute && <span className="text-ieee-danger text-sm ml-2">'{liveMinute}</span>}
              {match.result_after_penalties && <span className="text-muted-foreground text-sm ml-2">(Pens)</span>}
              {match.result_after_extra_time && !match.result_after_penalties && <span className="text-muted-foreground text-sm ml-2">(AET)</span>}
            </p>
          )}

          {isLive && !isFinished && <span className="inline-flex items-center gap-1.5 mt-2 text-sm font-medium text-ieee-danger"><span className="h-2 w-2 rounded-full bg-ieee-danger animate-pulse" /> LIVE</span>}
          {isFinished && <span className="inline-block mt-2 text-sm font-medium text-muted-foreground">Finished</span>}

          {/* Knockout notice */}
          {isKnockout && !isFinished && (
            <p className="mt-3 text-xs text-muted-foreground max-w-sm mx-auto">
              Knockout match — <strong className="text-foreground">Match Winner</strong> bets settle on who <em>advances</em>. Score markets (Correct Score, Total Goals, Clean Sheet) are 90-minute only.
            </p>
          )}
        </header>

        {/* Auth gate */}
        {status !== 'authenticated' && !betsLocked && (
          <div className="mb-6 rounded-lg border border-ieee-light-blue/40 bg-ieee-light-blue/5 p-4 text-center">
            <p className="text-sm text-foreground mb-3">Sign in with your @sahrdaya.ac.in account to place bets.</p>
            <button onClick={signIn} className="px-4 py-2 rounded-md bg-ieee-light-blue text-white text-sm font-medium hover:bg-ieee-blue transition-colors">Sign in with Google</button>
          </div>
        )}

        {betsLocked && !isFinished && (
          <div className="mb-6 rounded-lg border border-ieee-warning/40 bg-ieee-warning/5 p-4 text-center text-sm text-ieee-warning font-medium">
            Betting is closed for this match. Kickoff soon.
          </div>
        )}

        {/* Markets */}
        <div className="space-y-4">
          {match.markets.map((m) => (
            <MarketCard key={m.id} market={m} canBet={status === 'authenticated' && !betsLocked && m.is_open && !m.void} matchId={match.id} maxBet={maxBet} balance={balance} />
          ))}
          {match.markets.length === 0 && (
            <p className="text-muted-foreground text-center py-8">No markets open for this match yet.</p>
          )}
        </div>
      </div>
    </FifaLayout>
  )
}

// Market labels shared from src/schemas/fifa.ts

function MarketCard({ market, canBet, matchId, maxBet, balance }: { market: Market; canBet: boolean; matchId: string; maxBet: number; balance: number }) {
  const [selection, setSelection] = useState<string | null>(null)
  const [stake, setStake] = useState(Math.min(50, Math.max(1, maxBet)))
  const queryClient = useQueryClient()

  // Clamp stake to the 25% cap whenever maxBet changes (balance refresh).
  const effectiveStake = Math.min(stake, Math.max(1, maxBet || 1))

  const placeBet = useMutation({
    mutationFn: async () => {
      if (!selection) throw new Error('Pick an option first')
      const res = await fetch('/api/fifa/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market: market.id, match: matchId, selection, stake: effectiveStake }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Bet failed')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Bet placed!')
      setSelection(null)
      queryClient.invalidateQueries({ queryKey: ['fifa-dashboard'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const poolTotal = market.pool_total || 0
  const oddsFor = (opt: string): number | null => {
    if (market.mode !== 'fixed' || !market.fixed_odds) return null
    return market.fixed_odds[opt] ?? null
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display text-lg text-foreground">{FIFA_MARKET_LABELS[market.market_type] || market.market_type}</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {market.mode === 'pool' ? `Pool · ${poolTotal} pts` : 'Fixed odds'}
        </span>
      </div>
      {/* One-line blurb explaining the market (FIFA-GAME.md §2.5) */}
      <p className="text-xs text-muted-foreground mb-3">
        {FIFA_MARKET_BLURBS[market.market_type] || ''}
        {market.mode === 'pool' && ' Pool: winners split the pot by stake.'}
        {market.mode === 'fixed' && ' Fixed: stake × odds if you win.'}
      </p>

      {market.void && <p className="text-sm text-ieee-danger mb-2">This market has been voided. Stakes will be refunded.</p>}
      {!market.is_open && !market.void && <p className="text-sm text-muted-foreground mb-2">Market closed.</p>}

      {/* Options */}
      <div className="space-y-2">
        {market.options.map((opt) => {
          const isSelected = selection === opt
          const poolShare = poolTotal > 0 ? ((market.pool_by_option[opt] || 0) / poolTotal) * 100 : 0
          const odds = oddsFor(opt)
          return (
            <button
              key={opt}
              disabled={!canBet}
              onClick={() => setSelection(isSelected ? null : opt)}
              className={`w-full text-left rounded-md border p-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                isSelected ? 'border-ieee-blue bg-ieee-blue/5' : 'border-border hover:border-ieee-light-blue'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm text-foreground">{opt}</span>
                {market.mode === 'fixed' && odds && (
                  <span className="font-mono text-sm text-ieee-light-blue">{odds.toFixed(2)}×</span>
                )}
                {market.mode === 'pool' && (
                  <span className="font-mono text-xs text-muted-foreground">{poolShare.toFixed(0)}%</span>
                )}
              </div>
              {market.mode === 'pool' && poolTotal > 0 && (
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-ieee-light-blue transition-all duration-300" style={{ width: `${poolShare}%` }} />
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Betting slip */}
      {canBet && selection && (
        <div className="mt-4 rounded-md border border-ieee-blue/30 bg-ieee-blue/5 p-3">
          <p className="text-sm text-foreground mb-2">
            Bet on <strong>{selection}</strong> · {market.mode === 'fixed' && market.fixed_odds?.[selection]
              ? `${market.fixed_odds[selection].toFixed(2)}× odds → potential ${Math.round(effectiveStake * (market.fixed_odds[selection] || 0))} pts`
              : 'pool market — share of the pot if you win'}
          </p>
          <div className="flex items-center gap-2 mb-1">
            <label className="text-xs text-muted-foreground">Stake</label>
            <input
              type="number"
              min={1}
              max={maxBet || undefined}
              value={effectiveStake}
              onChange={(e) => setStake(Math.max(1, Number(e.target.value) || 0))}
              className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm font-mono"
            />
            <span className="text-xs text-muted-foreground">points</span>
          </div>
          <p className="text-[10px] text-muted-foreground mb-2">
            Max {maxBet} pts per bet (25% of your {balance} balance). <a href="/FIFA/rules" className="text-ieee-light-blue hover:underline">Why?</a>
          </p>
          <button
            onClick={() => placeBet.mutate()}
            disabled={placeBet.isPending || effectiveStake <= 0 || effectiveStake > maxBet}
            className="w-full rounded-md bg-ieee-blue px-4 py-2.5 text-sm font-bold text-white hover:bg-ieee-light-blue transition-colors disabled:opacity-50"
          >
            {placeBet.isPending ? 'Placing…' : `Place bet · ${effectiveStake} pts`}
          </button>
        </div>
      )}
    </section>
  )
}
