import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState, useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createPB } from '@/lib/pb.server'
import { escapeFilterValue } from '@/lib/pb'
import { getField } from '@/lib/safe-get'
import { FifaLayout } from '@/features/fifa/fifa-layout'
import { useAuth } from '@/lib/auth-context'
import { usePbSubscription } from '@/hooks/use-pb-subscription'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
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

const STAGE_LABELS: Record<string, string> = {
  r32: 'Round of 32',
  r16: 'Round of 16',
  qf: 'Quarterfinal',
  sf: 'Semifinal',
  third_place: 'Third Place',
  final: 'Final',
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
          options: (getField(mkt, 'options', []) ?? []) as string[],
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

function sortCorrectScores(options: string[]) {
  const common = ['1-0', '2-0', '2-1', '1-1', '0-0', '0-1', '0-2', '1-2']
  return [...options].sort((a, b) => {
    const iA = common.indexOf(a)
    const iB = common.indexOf(b)
    if (iA !== -1 && iB !== -1) return iA - iB
    if (iA !== -1) return -1
    if (iB !== -1) return 1
    const [hA, aA] = a.split('-').map(Number)
    const [hB, aB] = b.split('-').map(Number)
    const tgA = (hA || 0) + (aA || 0)
    const tgB = (hB || 0) + (aB || 0)
    if (tgA !== tgB) return tgA - tgB
    return (hB || 0) - (hA || 0)
  })
}

function MatchDetailPage() {
  const loaderMatch = Route.useLoaderData()
  const { id: matchId } = Route.useParams()
  const { status, signIn } = useAuth()
  const [isSessionExpired, setIsSessionExpired] = useState(false)
  const queryClient = useQueryClient()

  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null)
  const [selection, setSelection] = useState<string | null>(null)
  const [stake, setStake] = useState<number>(50)

  const effectiveStatus = isSessionExpired ? 'unauthenticated' : status

  const { isConnected: wsConnected } = usePbSubscription('fifa_bet_markets', '*', (e) => {
    if (e.action === 'update' && matchId) {
      queryClient.setQueryData(['fifa-match', matchId], (old: MatchDetail | undefined) => {
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

  const { data: match, refetch: refetchMatch } = useQuery({
    queryKey: ['fifa-match', matchId],
    queryFn: () => fetchMatch({ data: matchId }),
    initialData: loaderMatch,
    enabled: !!matchId,
    refetchInterval: wsConnected ? false : 15_000,
  })

  useEffect(() => {
    if (wsConnected) refetchMatch()
  }, [wsConnected, refetchMatch])

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

  const { data: userBalance } = useQuery({
    queryKey: ['fifa-dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/fifa/dashboard')
      if (res.status === 401 || res.status === 403) {
        setIsSessionExpired(true)
        toast.error('Your session expired — please log in again', { id: 'session-expired' })
        throw new Error('Session expired')
      }
      if (!res.ok) return null
      return res.json() as Promise<{ user: { balance: number }; max_bet_percent?: number }>
    },
    enabled: status === 'authenticated' && !isSessionExpired,
    refetchInterval: 15_000,
  })
  const balance = userBalance?.user?.balance ?? 0
  const maxBetPercent = userBalance?.max_bet_percent ?? 25
  const maxBet = Math.floor(balance * maxBetPercent / 100)

  // Ensure stake does not exceed newly fetched maxBet
  useEffect(() => {
    if (stake > maxBet && maxBet > 0) {
      setStake(Math.max(1, maxBet))
    }
  }, [maxBet, stake])

  const placeBet = useMutation({
    mutationFn: async () => {
      if (!selectedMarketId || !selection) throw new Error('Pick an option first')
      const effectiveStake = Math.min(stake, Math.max(1, maxBet || 1))
      const res = await fetch('/api/fifa/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market: selectedMarketId, match: matchId, selection, stake: effectiveStake }),
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
      setSelectedMarketId(null)
      queryClient.invalidateQueries({ queryKey: ['fifa-dashboard'] })
    },
    onError: (err: Error) => toast.error(err.message),
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
  const canBet = effectiveStatus === 'authenticated' && !betsLocked

  const liveHomeGoals = liveMatch?.homeGoals ?? match.result_home_goals
  const liveAwayGoals = liveMatch?.awayGoals ?? match.result_away_goals
  const liveMinute = liveMatch?.minute

  const handleSelect = (marketId: string, opt: string) => {
    if (selectedMarketId === marketId && selection === opt) {
      setSelection(null)
      setSelectedMarketId(null)
    } else {
      setSelectedMarketId(marketId)
      setSelection(opt)
    }
  }

  const selectedMarket = match.markets?.find((m) => m.id === selectedMarketId)
  const effectiveStake = Math.min(stake, Math.max(1, maxBet || 1))

  const renderBettingSlip = (isMobile: boolean) => {
    const quickStakes = [10, 25, 50, 100].filter((s) => s <= maxBet)
    return (
      <div className={`rounded-xl border border-border bg-card shadow-sm ${isMobile ? 'p-4' : 'p-5'}`}>
        <div className="flex items-center justify-between mb-4 border-b border-border/50 pb-3">
          <h2 className="font-display text-lg text-foreground">Betting Slip</h2>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Balance</p>
            <p className="font-mono text-sm font-semibold text-ieee-blue">{balance} pts</p>
          </div>
        </div>

        {!selectedMarket || !selection ? (
          <div className="py-8 text-center border-2 border-dashed border-border rounded-lg bg-muted/20">
            <p className="text-sm text-muted-foreground">Select a market option to place a bet.</p>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={selectedMarket.id + selection}>
            <div className="mb-4 rounded-lg border border-ieee-blue/20 bg-ieee-blue/5 p-3">
              <p className="text-xs text-ieee-light-blue font-medium mb-1">{FIFA_MARKET_LABELS[selectedMarket.market_type] || selectedMarket.market_type}</p>
              <p className="text-sm text-foreground font-semibold mb-2">
                {selection}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {selectedMarket.mode === 'fixed' && selectedMarket.fixed_odds?.[selection]
                  ? <span className="font-mono text-ieee-blue font-medium">{selectedMarket.fixed_odds[selection].toFixed(2)}×</span>
                  : 'Pool — share of the pot'}
                {selectedMarket.mode === 'fixed' && selectedMarket.fixed_odds?.[selection] && ` → potential ${Math.round(effectiveStake * (selectedMarket.fixed_odds[selection] || 0))} pts`}
              </p>
            </div>

            {quickStakes.length > 0 && (
              <div className="flex gap-2 mb-3">
                {quickStakes.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStake(s)}
                    className={`flex-1 rounded-md py-2 text-xs font-mono font-medium transition-colors ${
                      effectiveStake === s
                        ? 'bg-ieee-blue text-white shadow-sm'
                        : 'bg-background border border-border hover:border-ieee-light-blue hover:text-ieee-blue'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-1.5 mb-4">
              <label className="text-xs font-medium text-muted-foreground">Stake Amount (pts)</label>
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={maxBet || undefined}
                  value={effectiveStake}
                  onChange={(e) => setStake(Math.max(1, Number(e.target.value) || 0))}
                  className="w-full rounded-lg border border-border bg-background pl-3 pr-10 py-2.5 text-sm font-mono focus:border-ieee-blue focus:ring-1 focus:ring-ieee-blue outline-none transition-all"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">pts</span>
              </div>
              <p className="text-[10px] text-muted-foreground text-right mt-0.5">
                Max {maxBet} pts ({maxBetPercent}% limit)
              </p>
            </div>

            <button
              onClick={() => placeBet.mutate()}
              disabled={placeBet.isPending || effectiveStake <= 0 || effectiveStake > maxBet}
              className="w-full rounded-lg bg-ieee-blue px-4 py-3.5 text-sm font-bold text-white hover:bg-ieee-light-blue hover:shadow-md transition-all disabled:opacity-50 disabled:hover:shadow-none min-h-[48px] active:scale-[0.98]"
            >
              {placeBet.isPending ? 'Placing Bet…' : `Place Bet · ${effectiveStake} pts`}
            </button>
          </motion.div>
        )}
      </div>
    )
  }

  return (
    <FifaLayout active="matches">
      <div className="mx-auto max-w-[1200px] px-4 py-6 md:py-8">
        <Link to="/FIFA/matches/" className="text-sm font-medium text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Back to matches
        </Link>

        <div className="lg:grid lg:grid-cols-12 lg:gap-8 items-start">
          {/* Left Column: Hero & Markets */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-6">
            
            {/* Match hero — Redesigned */}
            <motion.header
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-2xl border border-border bg-gradient-to-br from-card to-muted/50 overflow-hidden relative shadow-sm"
            >
              <div className="px-5 py-6 sm:py-8 text-center relative z-10">
                <span className="inline-block px-3 py-1 rounded-full bg-ieee-light-blue/10 border border-ieee-light-blue/20 text-ieee-blue font-mono text-[10px] uppercase tracking-[0.2em] mb-5 font-bold">
                  {STAGE_LABELS[match.stage] || match.stage.toUpperCase()}
                </span>
                
                <div className="flex items-center justify-center gap-4 sm:gap-8">
                  <h1 className="font-display text-3xl sm:text-5xl text-foreground leading-[1.05] flex-1 text-right">
                    {match.team_home}
                  </h1>
                  <div className="flex-shrink-0 flex flex-col items-center justify-center min-w-[80px]">
                    {(isLive || isFinished) ? (
                      <div className="text-center">
                        <p className="font-mono text-4xl sm:text-5xl font-bold text-ieee-blue tracking-tighter leading-none">
                          {liveHomeGoals}<span className="text-muted-foreground/30 font-light mx-1">-</span>{liveAwayGoals}
                        </p>
                        {isLive && liveMinute && <p className="font-mono text-xs font-bold text-ieee-danger mt-2 animate-pulse">'{liveMinute}</p>}
                        {match.result_after_penalties && <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-2">(Pens)</p>}
                        {match.result_after_extra_time && !match.result_after_penalties && <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-2">(AET)</p>}
                      </div>
                    ) : (
                      <span className="font-display text-lg text-muted-foreground/60 italic">vs</span>
                    )}
                  </div>
                  <h1 className="font-display text-3xl sm:text-5xl text-foreground leading-[1.05] flex-1 text-left">
                    {match.team_away}
                  </h1>
                </div>
                
                <div className="mt-6 flex flex-col items-center gap-2">
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {kickoff.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                  {isLive && !isFinished && (
                    <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-md bg-ieee-danger/10 text-[10px] font-bold text-ieee-danger uppercase tracking-widest">
                      <span className="h-1.5 w-1.5 rounded-full bg-ieee-danger animate-pulse" /> Live Now
                    </span>
                  )}
                  {isFinished && <span className="inline-flex px-2.5 py-1 mt-1 rounded-md bg-muted text-[10px] font-bold text-foreground uppercase tracking-widest">Finished</span>}
                </div>
              </div>
            </motion.header>

            {/* Auth / Status Guards */}
            {effectiveStatus !== 'authenticated' && !betsLocked && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-ieee-light-blue/30 bg-ieee-light-blue/5 p-5 text-center flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-sm text-foreground text-left max-w-sm">
                  {isSessionExpired ? 'Your session expired. Please sign in again to place bets.' : 'You must be signed in with your @sahrdaya.ac.in account to place bets.'}
                </p>
                <button onClick={signIn} className="whitespace-nowrap px-6 py-2.5 rounded-lg bg-ieee-blue text-white text-sm font-semibold hover:bg-ieee-light-blue transition-colors shadow-sm">Sign in with Google</button>
              </motion.div>
            )}

            {betsLocked && !isFinished && (
              <div className="rounded-xl border border-ieee-warning/40 bg-ieee-warning/5 p-4 flex items-center gap-3 text-sm text-ieee-warning font-semibold">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                Betting is closed for this match.
              </div>
            )}

            {!wsConnected && (
              <div className="flex items-center gap-2 rounded-lg border border-ieee-warning/30 bg-ieee-warning/10 py-2 px-4 text-xs font-medium text-ieee-warning">
                <span className="h-1.5 w-1.5 rounded-full bg-ieee-warning animate-pulse flex-shrink-0" />
                Live connection dropped — falling back to polling.
              </div>
            )}

            {/* Markets List */}
            <div className="space-y-4">
              <h3 className="font-display text-xl text-foreground border-b border-border pb-2">Available Markets</h3>
              {(!match.markets || match.markets.length === 0) ? (
                <div className="text-center py-12 border border-dashed border-border rounded-xl bg-muted/10">
                  <p className="text-muted-foreground text-sm">No markets open for this match yet.</p>
                </div>
              ) : (
                match.markets.map((m, i) => (
                  <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 + i * 0.05 }}>
                    <MarketCard 
                      market={m} 
                      canBet={canBet && m.is_open && !m.void} 
                      selectedOption={selectedMarketId === m.id ? selection : null}
                      onSelect={(opt) => handleSelect(m.id, opt)}
                      isKnockout={isKnockout}
                    />
                  </motion.div>
                ))
              )}
            </div>
          </div>

          {/* Right Column: Desktop Betting Slip */}
          <div className="hidden lg:block lg:col-span-5 xl:col-span-4 sticky top-6 self-start z-20">
            {renderBettingSlip(false)}
          </div>
        </div>
      </div>

      {/* Mobile Betting Slip Bottom Sheet */}
      <AnimatePresence>
        {canBet && selectedMarketId && selection && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            className="fixed inset-x-0 bottom-0 z-50 lg:hidden shadow-[0_-10px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_-10px_40px_rgba(0,0,0,0.5)] border-t border-border"
          >
            {renderBettingSlip(true)}
          </motion.div>
        )}
      </AnimatePresence>
    </FifaLayout>
  )
}

function MarketCard({ market, canBet, selectedOption, onSelect, isKnockout }: { market: Market; canBet: boolean; selectedOption: string | null; onSelect: (opt: string) => void; isKnockout: boolean }) {
  const poolTotal = market.pool_total || 0
  const oddsFor = (opt: string): number | null => {
    if (market.mode !== 'fixed' || !market.fixed_odds) return null
    return market.fixed_odds[opt] ?? null
  }

  // Handle specific grid layouts based on market type
  const isCorrectScore = market.market_type === 'correct_score'
  const options = isCorrectScore ? sortCorrectScores(market.options ?? []) : (market.options ?? [])

  return (
    <section className={`rounded-xl border transition-colors bg-card overflow-hidden ${selectedOption ? 'border-ieee-blue ring-1 ring-ieee-blue/20 shadow-sm' : 'border-border'}`}>
      <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-border/50 bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-foreground flex items-center gap-2">
            {FIFA_MARKET_LABELS[market.market_type] || market.market_type}
            {market.void && <span className="px-2 py-0.5 rounded-md bg-ieee-danger/10 text-ieee-danger text-[10px] uppercase font-bold tracking-wider">Voided</span>}
            {!market.is_open && !market.void && <span className="px-2 py-0.5 rounded-md bg-muted-foreground/10 text-muted-foreground text-[10px] uppercase font-bold tracking-wider">Closed</span>}
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {FIFA_MARKET_BLURBS[market.market_type] || ''}
            {isKnockout && (market.market_type === 'match_winner' || market.market_type === 'correct_score') && (
              <span className="font-medium text-foreground ml-1">
                {market.market_type === 'match_winner' ? '(Settles on who advances)' : '(90-mins only)'}
              </span>
            )}
          </p>
        </div>
        <div className="flex-shrink-0 flex items-center gap-2 sm:flex-col sm:items-end sm:gap-1">
          <span className={`px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-widest ${market.mode === 'pool' ? 'bg-ieee-light-blue/10 text-ieee-blue border border-ieee-light-blue/20' : 'bg-green-500/10 text-green-600 border border-green-500/20'}`}>
            {market.mode === 'pool' ? 'Pool' : 'Fixed'}
          </span>
          {market.mode === 'pool' && (
            <span className="text-xs font-mono text-muted-foreground font-medium">
              {poolTotal} <span className="text-[10px]">PTS</span>
            </span>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {market.void ? (
          <p className="text-sm text-ieee-danger text-center py-4">This market has been voided. All stakes will be refunded.</p>
        ) : (
          <div className={`grid gap-2 sm:gap-3 ${isCorrectScore ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3'}`}>
            {options.map((opt) => {
              const isSelected = selectedOption === opt
              const poolShare = poolTotal > 0 ? ((market.pool_by_option[opt] || 0) / poolTotal) * 100 : 0
              const odds = oddsFor(opt)
              return (
                <button
                  key={opt}
                  disabled={!canBet || !market.is_open}
                  onClick={() => onSelect(opt)}
                  className={`relative flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    isSelected 
                      ? 'border-ieee-blue bg-ieee-blue/5 shadow-inner' 
                      : 'border-border/60 bg-background hover:border-ieee-light-blue/50 hover:bg-muted/30'
                  }`}
                >
                  <span className={`font-semibold text-center leading-tight mb-1 ${isCorrectScore ? 'text-lg font-mono tracking-tighter' : 'text-sm'}`}>{opt}</span>
                  
                  {market.mode === 'fixed' && odds && (
                    <span className="font-mono text-xs text-ieee-blue font-medium bg-ieee-blue/10 px-1.5 rounded">{odds.toFixed(2)}×</span>
                  )}
                  {market.mode === 'pool' && (
                    <span className="font-mono text-[10px] text-muted-foreground">{poolShare.toFixed(0)}%</span>
                  )}

                  {/* Thin pool bar at bottom */}
                  {market.mode === 'pool' && poolTotal > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-border/40 rounded-b-xl overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${poolShare}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        className={`h-full ${isSelected ? 'bg-ieee-blue' : 'bg-ieee-light-blue/60'}`}
                      />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}