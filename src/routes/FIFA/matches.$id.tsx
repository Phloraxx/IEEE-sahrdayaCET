import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState, useEffect } from 'react'
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
import { getSettledMarketStatus, type SettledMarketStatus } from '@/lib/fifa-market-result'
import {
  formatMarketOptionLabel,
  formatOuLineSummary,
  formatOuMarketBlurb,
  isOuMarket,
} from '@/lib/fifa-market-labels'
import { getMatchCardAsset, getStageColor } from '@/lib/fifa-assets'
import { FifaMatchPlayerCutout } from '@/features/fifa/fifa-match-player-cutout'
import { DEFAULT_FIFA_LEADERBOARD_SETTINGS } from '@/lib/fifa-leaderboard'
import { fetchFifaDashboard, FifaDashboardAuthError } from '@/lib/fifa-dashboard-client'
import { formatDateTime } from '@/lib/dates'
import { AlertCircle, ChevronLeft } from 'lucide-react'

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
  const { status, signIn, user } = useAuth()
  const [isSessionExpired, setIsSessionExpired] = useState(false)
  const queryClient = useQueryClient()

  // Hoisted betting slip state
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [stake, setStake] = useState<number>(0)
  const [hasUserEditedStake, setHasUserEditedStake] = useState(false)
  const handleSetStake = (v: number) => {
    setHasUserEditedStake(true)
    setStake(v)
  }

  const effectiveStatus = isSessionExpired ? 'unauthenticated' : status

  const { isConnected: wsConnected } = usePbSubscription('fifa_bet_markets', '*', (e) => {
    if (e.action === 'update' && matchId) {
      queryClient.setQueryData(['fifa-match', matchId], (old: MatchDetail | undefined) => {
        if (!old) return old
        return {
          ...old,
          markets: old.markets.map((m) =>
            m.id === (e.record as Record<string, unknown>).id
              ? {
                  ...m,
                  pool_total: Number(getField(e.record, 'pool_total', 0)),
                  pool_by_option: getField(e.record, 'pool_by_option', {}) as Record<string, number>,
                  is_open: getField(e.record, 'is_open', m.is_open),
                  void: getField(e.record, 'void', m.void),
                }
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

  const { data: userBalance, error: dashboardError } = useQuery({
    queryKey: ['fifa-dashboard'],
    queryFn: fetchFifaDashboard,
    enabled: status === 'authenticated' && !isSessionExpired,
    refetchInterval: 15_000,
  })

  useEffect(() => {
    if (dashboardError instanceof FifaDashboardAuthError) {
      setIsSessionExpired(true)
      toast.error('Your session expired — please log in again', { id: 'session-expired' })
    }
  }, [dashboardError])

  const balance = userBalance?.user?.balance ?? 0
  const maxBetPercent = userBalance?.max_bet_percent ?? 25
  const maxBet = Math.floor((balance * maxBetPercent) / 100)
  const validBetsCount = userBalance?.valid_bets_count ?? 0

  const { data: lbData } = useQuery({
    queryKey: ['fifa-leaderboard'],
    queryFn: async () => {
      const res = await fetch('/pb/api/fifa/leaderboard')
      if (!res.ok) return null
      return res.json() as Promise<{ leaderboard: Array<{ id: string; rank: number }>; settings?: { min_bets: number } }>
    },
    enabled: status === 'authenticated' && !isSessionExpired,
    staleTime: 15_000,
  })
  const minBets = lbData?.settings?.min_bets ?? DEFAULT_FIFA_LEADERBOARD_SETTINGS.min_bets
  const myRank =
    user?.id && lbData?.leaderboard
      ? lbData.leaderboard.find((r) => r.id === user.id)?.rank
      : undefined
  // Keep the default stake pinned to maxBet until the user manually edits
  // it; once edited, only pull it back down if it's grown invalid (maxBet
  // shrank below the user's chosen stake) rather than silently overwriting
  // a deliberate choice.
  useEffect(() => {
    if (maxBet <= 0) return
    if (!hasUserEditedStake) {
      setStake(Math.min(50, Math.max(1, maxBet)))
    } else if (stake > maxBet) {
      setStake(maxBet)
    }
  }, [maxBet, hasUserEditedStake, stake])

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

  const asset = getMatchCardAsset(match.team_home, match.team_away, match.stage)
  const stageColor = getStageColor(match.stage)

  const liveHomeGoals = liveMatch?.homeGoals ?? match.result_home_goals
  const liveAwayGoals = liveMatch?.awayGoals ?? match.result_away_goals
  const liveMinute = liveMatch?.minute

  // Handlers for child components
  const handleOptionSelect = (marketId: string, option: string) => {
    if (selectedMarketId === marketId && selectedOption === option) {
      setSelectedMarketId(null)
      setSelectedOption(null)
    } else {
      setSelectedMarketId(marketId)
      setSelectedOption(option)
    }
  }

  const teams = { team_home: match.team_home, team_away: match.team_away }

  const bettingSlipProps = {
    matchId: match.id,
    canBet: effectiveStatus === 'authenticated' && !betsLocked,
    market: match.markets.find((m) => m.id === selectedMarketId) || null,
    selection: selectedOption,
    teams,
    stake,
    setStake: handleSetStake,
    maxBet,
    maxBetPercent,
    balance,
    minBets,
    myRank,
    validBetsCount,
    onClear: () => {
      setSelectedMarketId(null)
      setSelectedOption(null)
    },
  }

  return (
    <FifaLayout active="matches">
      <div className="w-full flex-1 flex flex-col bg-[#0a0a0b]">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <Link to="/FIFA/matches/" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors">
            <ChevronLeft className="w-4 h-4" /> All matches
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-[1.8fr_1fr] xl:grid-cols-[2fr_1fr] gap-6 xl:gap-10">
            {/* LEFT COLUMN: Hero & Markets */}
            <div className="space-y-6">
              {/* Match hero */}
              <motion.header
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="relative rounded-2xl border border-border bg-[#101823] overflow-hidden shadow-sm"
              >
                <div
                  className="absolute inset-0 bg-cover bg-no-repeat"
                  style={{
                    backgroundImage: `url("${asset.imageUrl}")`,
                    backgroundPosition: asset.position,
                    opacity: 0.6,
                  }}
                />
                {asset.isFallback && (
                  <div
                    className="absolute inset-0"
                    style={{ background: `linear-gradient(135deg, ${stageColor}66, transparent)` }}
                  />
                )}
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(180deg, rgba(10,10,11,.85) 0%, rgba(10,10,11,.6) 40%, rgba(10,10,11,.95) 100%)',
                  }}
                />
                
                <div className="relative px-6 pt-8 pb-6 text-center z-10">
                  <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ieee-light-blue mb-4 font-semibold">
                    {STAGE_LABELS[match.stage] || match.stage.toUpperCase()}
                  </p>
                  <div className="flex items-end justify-center gap-3 sm:gap-6">
                    <div className="flex flex-1 flex-col items-end gap-3">
                      <FifaMatchPlayerCutout team={match.team_home} side="home" size="hero" />
                      <h1 className="font-display text-3xl sm:text-5xl text-foreground leading-[1.05] text-right">
                        {match.team_home}
                      </h1>
                    </div>
                    <div className="flex-shrink-0 self-center text-center">
                      {(isLive || isFinished) ? (
                        <div className="bg-[#111113] border border-border px-4 py-2 rounded-lg">
                          <p className="font-mono text-4xl sm:text-5xl text-foreground leading-none">
                            {liveHomeGoals}<span className="text-muted-foreground mx-2">-</span>{liveAwayGoals}
                          </p>
                          {isLive && liveMinute && <p className="font-mono text-sm text-ieee-danger mt-2 font-bold animate-pulse">'{liveMinute}</p>}
                          {match.result_after_penalties && <p className="text-[11px] text-muted-foreground mt-1 uppercase tracking-wider">(Pens)</p>}
                          {match.result_after_extra_time && !match.result_after_penalties && <p className="text-[11px] text-muted-foreground mt-1 uppercase tracking-wider">(AET)</p>}
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-muted/30 border border-border flex items-center justify-center">
                          <p className="font-sans text-sm font-semibold text-muted-foreground">VS</p>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col items-start gap-3">
                      <FifaMatchPlayerCutout team={match.team_away} side="away" size="hero" />
                      <h1 className="font-display text-3xl sm:text-5xl text-foreground leading-[1.05] text-left">
                        {match.team_away}
                      </h1>
                    </div>
                  </div>
                  <div className="mt-6 inline-block bg-muted/30 border border-border/50 rounded-full px-4 py-1.5">
                    {/* Use the shared en-IN formatter (dates.ts) so SSR and client
                        render the identical string. Raw toLocaleString() with no locale
                        picked up Node's default (en-US) on the server vs the browser
                        locale on the client, and that text mismatch threw React #418 —
                        which bailed hydration and duplicated the footer. */}
                    <p className="text-sm font-medium text-foreground">{formatDateTime(match.kickoff_at)}</p>
                  </div>

                  {isLive && !isFinished && (
                    <div className="mt-4">
                      <span className="inline-flex items-center gap-2 rounded-full bg-ieee-danger/10 border border-ieee-danger/30 px-3 py-1 text-xs font-bold text-ieee-danger uppercase tracking-widest">
                        <span className="h-2 w-2 rounded-full bg-ieee-danger animate-pulse" /> Live
                      </span>
                    </div>
                  )}
                  {isFinished && <div className="mt-4"><span className="inline-flex items-center rounded-full bg-muted border border-border px-3 py-1 text-xs font-bold text-muted-foreground uppercase tracking-widest">Finished</span></div>}
                </div>

                {isKnockout && !isFinished && (
                  <div className="border-t border-border bg-ieee-light-blue/5 px-6 py-3 text-center flex items-center justify-center gap-2">
                    <AlertCircle className="w-4 h-4 text-ieee-light-blue" />
                    <p className="text-sm text-foreground">
                      <strong>Match Winner</strong> settles on who advances. Score markets are 90-min only.
                    </p>
                  </div>
                )}
              </motion.header>

              {/* Status gates */}
              {effectiveStatus !== 'authenticated' && !betsLocked && (
                <div className="rounded-xl border border-ieee-light-blue/40 bg-ieee-light-blue/5 p-6 text-center shadow-sm">
                  <p className="text-base text-foreground mb-4">
                    {isSessionExpired ? 'Your session expired. Please sign in again to place bets.' : 'Sign in with your @sahrdaya.ac.in account to place bets.'}
                  </p>
                  <button onClick={signIn} className="px-6 py-3 rounded-lg bg-ieee-blue text-white text-base font-semibold hover:bg-ieee-light-blue transition-colors shadow-sm">Sign in with Google</button>
                </div>
              )}

              {betsLocked && !isFinished && (
                <div className="rounded-xl border border-ieee-warning/40 bg-ieee-warning/5 p-4 text-center text-sm text-ieee-warning font-semibold">
                  Betting is closed for this match
                </div>
              )}

              {!wsConnected && (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-ieee-warning/30 bg-ieee-warning/10 py-2 px-4 text-xs font-medium text-ieee-warning">
                  <span className="h-2 w-2 rounded-full bg-ieee-warning animate-pulse" />
                  Live connection dropped — polling every 15s
                </div>
              )}

              {/* MARKETS GRID */}
              <div>
                <h3 className="font-display text-2xl uppercase text-foreground mb-4">Markets</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {match.markets?.map((m, i) => (
                    <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 + i * 0.05 }}
                      className={`${m.market_type === 'correct_score' ? 'sm:col-span-2' : ''}`}
                    >
                      <MarketCard
                        market={m}
                        teams={teams}
                        matchSettled={match.settled || isFinished}
                        matchResult={
                          isFinished &&
                          match.result_home_goals != null &&
                          match.result_away_goals != null
                            ? {
                                result_winner: (match.result_winner || '') as 'home' | 'away' | 'draw' | '',
                                result_home_goals: match.result_home_goals,
                                result_away_goals: match.result_away_goals,
                                result_advance: (match.result_advance || '') as 'home' | 'away' | '',
                              }
                            : null
                        }
                        canBet={effectiveStatus === 'authenticated' && !betsLocked && m.is_open && !m.void}
                        isSelected={selectedMarketId === m.id}
                        selectedOption={selectedOption}
                        onSelectOption={(opt) => handleOptionSelect(m.id, opt)}
                      />
                    </motion.div>
                  ))}
                  {(!match.markets || match.markets.length === 0) && (
                    <div className="sm:col-span-2 rounded-xl border border-dashed border-border bg-card/50 py-16 text-center">
                      <p className="text-muted-foreground">No markets open for this match yet.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Sticky Slip (desktop) */}
            <div className="relative hidden lg:block">
              <div className="sticky top-24">
                <BettingSlip {...bettingSlipProps} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Betting Slip Bottom Sheet */}
      <AnimatePresence>
        {bettingSlipProps.canBet && selectedMarketId && selectedOption && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            className="fixed inset-x-0 bottom-0 z-50 lg:hidden max-h-[85vh] overflow-y-auto shadow-[0_-10px_40px_rgba(0,0,0,0.5)]"
          >
            <BettingSlip {...bettingSlipProps} />
          </motion.div>
        )}
      </AnimatePresence>
    </FifaLayout>
  )
}

function getPoolOptionOutcomeLabel(
  settledStatus: SettledMarketStatus,
  isResultPick: boolean,
  hadStakes: boolean,
  poolShare: number,
): string | null {
  if (settledStatus === 'voided') return hadStakes ? 'Refunded' : '—'
  if (settledStatus === 'pool_refunded') {
    if (isResultPick) return 'Winning score · no bets'
    return hadStakes ? 'Refunded' : '—'
  }
  if (settledStatus === 'settled') {
    if (isResultPick) return hadStakes ? `Winner · ${poolShare.toFixed(0)}%` : 'Winner'
    return hadStakes ? 'Lost' : '—'
  }
  return null
}

function MarketCard({
  market,
  teams,
  matchSettled,
  matchResult,
  canBet,
  isSelected,
  selectedOption,
  onSelectOption,
}: {
  market: Market
  teams: { team_home: string; team_away: string }
  matchSettled: boolean
  matchResult: {
    result_winner: 'home' | 'away' | 'draw' | ''
    result_home_goals: number
    result_away_goals: number
    result_advance: 'home' | 'away' | ''
  } | null
  canBet: boolean
  isSelected: boolean
  selectedOption: string | null
  onSelectOption: (opt: string) => void
}) {
  const poolTotal = market.pool_total || 0
  const oddsFor = (opt: string): number | null => (market.mode === 'fixed' && market.fixed_odds) ? (market.fixed_odds[opt] ?? null) : null

  const { status: settledStatus, winningSelections } = getSettledMarketStatus(
    market,
    matchResult,
    matchSettled,
  )
  const winningSet = new Set(winningSelections)
  const isSettledView = settledStatus === 'settled' || settledStatus === 'pool_refunded' || settledStatus === 'voided'

  const isCorrectScore = market.market_type === 'correct_score'
  const options = isCorrectScore ? sortCorrectScores(market.options ?? []) : (market.options ?? [])

  const formatOption = (sel: string) =>
    formatMarketOptionLabel(market.market_type, sel, teams, market.line)

  const ouLineSummary = formatOuLineSummary(market.market_type, market.line)

  return (
    <section className={`rounded-xl border bg-card p-5 h-full flex flex-col transition-colors ${isSelected ? 'border-ieee-blue shadow-[0_0_15px_rgba(30,136,229,0.15)]' : 'border-border'}`}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display text-lg text-foreground">{FIFA_MARKET_LABELS[market.market_type] || market.market_type}</h2>
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-1 bg-muted/50 rounded-md text-muted-foreground border border-border">
          {market.mode === 'pool'
            ? isSettledView
              ? `Final pool · ${poolTotal} tickets`
              : `Pool · ${poolTotal} tickets`
            : 'Fixed odds'}
        </span>
      </div>
      {ouLineSummary && (
        <p className="text-sm font-semibold text-ieee-light-blue mb-2 font-mono tracking-tight">
          Line: {ouLineSummary}
        </p>
      )}
      <p className="text-[12px] text-muted-foreground mb-4 leading-relaxed">
        {isOuMarket(market.market_type)
          ? formatOuMarketBlurb(market.market_type, market.line)
          : FIFA_MARKET_BLURBS[market.market_type] || ''}
      </p>

      {settledStatus === 'voided' && (
        <p className="text-sm font-semibold text-ieee-danger mb-4 p-2 bg-ieee-danger/10 rounded-md border border-ieee-danger/20">
          This market has been voided. Stakes refunded.
        </p>
      )}
      {settledStatus === 'pool_refunded' && (
        <p className="text-sm font-semibold text-muted-foreground mb-4 p-2 bg-muted/30 rounded-md border border-border">
          Winning outcome{winningSelections.length > 0 ? ` was ${winningSelections.map(formatOption).join(' / ')}` : ''} — nobody in the pool picked it. All stakes refunded.
        </p>
      )}
      {settledStatus === 'settled' && winningSelections.length > 0 && (
        <p className="text-sm font-semibold text-ieee-success mb-4 p-2 bg-ieee-success/10 rounded-md border border-ieee-success/20">
          Winning pick: {winningSelections.map(formatOption).join(' / ')}
        </p>
      )}
      {settledStatus === 'closed' && (
        <p className="text-sm font-semibold text-muted-foreground mb-4 p-2 bg-muted/20 rounded-md border border-border">Market closed.</p>
      )}

      <div className={`mt-auto ${isCorrectScore ? 'grid grid-cols-3 md:grid-cols-4 gap-2' : 'space-y-2'}`}>
        {options.map((opt) => {
          const isActive = isSelected && selectedOption === opt
          const isResultPick = winningSet.has(opt)
          const isWinner = settledStatus === 'settled' && isResultPick
          const isResultOnly = settledStatus === 'pool_refunded' && isResultPick
          const poolShare = poolTotal > 0 ? ((market.pool_by_option[opt] || 0) / poolTotal) * 100 : 0
          const hadStakes = (market.pool_by_option[opt] || 0) > 0
          const odds = oddsFor(opt)
          const outcomeLabel = getPoolOptionOutcomeLabel(settledStatus, isResultPick, hadStakes, poolShare)
          const highlight = isWinner || isResultOnly
          const displayOpt = formatOption(opt)

          const baseClass = highlight
            ? 'border-ieee-success bg-ieee-success/15 ring-1 ring-ieee-success/40 text-foreground'
            : isSettledView && market.mode === 'pool'
              ? 'border-border/60 bg-[#111113]/80 text-muted-foreground'
              : isActive
                ? 'border-ieee-blue bg-ieee-blue text-white shadow-md'
                : 'border-border bg-[#111113] hover:border-ieee-light-blue text-foreground'

          if (isCorrectScore) {
            const Tag = isSettledView ? 'div' : 'button'
            return (
              <Tag
                key={opt}
                {...(!isSettledView
                  ? { type: 'button' as const, disabled: !canBet, onClick: () => onSelectOption(opt) }
                  : {})}
                className={`w-full text-center rounded-lg border py-3 transition-all ${!isSettledView ? 'disabled:opacity-50 disabled:cursor-not-allowed' : ''} ${baseClass}`}
              >
                <div className="font-mono font-bold text-lg mb-1">{displayOpt}</div>
                {market.mode === 'fixed' && odds && !isSettledView && (
                  <div className={`text-[10px] font-mono ${isActive ? 'text-white/80' : 'text-ieee-light-blue'}`}>{odds.toFixed(2)}×</div>
                )}
                {market.mode === 'pool' && isSettledView && outcomeLabel && (
                  <div className={`text-[10px] font-mono font-semibold uppercase tracking-wide ${highlight ? 'text-ieee-success' : 'text-muted-foreground'}`}>{outcomeLabel}</div>
                )}
                {market.mode === 'pool' && !isSettledView && (
                  <div className={`text-[10px] font-mono ${isActive ? 'text-white/80' : 'text-muted-foreground'}`}>{poolShare.toFixed(0)}%</div>
                )}
              </Tag>
            )
          }

          const Tag = isSettledView ? 'div' : 'button'
          return (
            <Tag
              key={opt}
              {...(!isSettledView
                ? { type: 'button' as const, disabled: !canBet, onClick: () => onSelectOption(opt) }
                : {})}
              className={`relative w-full text-left rounded-lg border p-3.5 transition-all ${!isSettledView ? 'disabled:opacity-50 disabled:cursor-not-allowed' : ''} min-h-[52px] overflow-hidden ${baseClass}`}
            >
              <div className="relative z-10 flex items-center justify-between mb-1">
                <span className={`font-medium text-sm ${isActive && !isSettledView ? 'text-ieee-light-blue' : ''}`}>{displayOpt}</span>
                {market.mode === 'fixed' && odds && !isSettledView && (
                  <span className="font-mono text-sm font-bold text-ieee-light-blue">{odds.toFixed(2)}×</span>
                )}
                {market.mode === 'pool' && isSettledView && outcomeLabel && (
                  <span className={`font-mono text-[10px] font-semibold uppercase tracking-wide ${highlight ? 'text-ieee-success' : 'text-muted-foreground'}`}>{outcomeLabel}</span>
                )}
                {market.mode === 'pool' && !isSettledView && (
                  <span className="font-mono text-xs font-semibold text-muted-foreground">{poolShare.toFixed(0)}%</span>
                )}
              </div>
              {market.mode === 'pool' && poolTotal > 0 && !isSettledView && (
                <div className="relative z-10 h-1.5 w-full mt-2 rounded-full bg-black/40 overflow-hidden border border-white/5">
                  <motion.div
                    initial={false}
                    animate={{ width: `${poolShare}%` }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className={`h-full ${isActive ? 'bg-ieee-blue' : 'bg-ieee-light-blue/50'}`}
                  />
                </div>
              )}
            </Tag>
          )
        })}
      </div>
    </section>
  )
}

function BettingSlip({ matchId, canBet, market, selection, teams, stake, setStake, maxBet, maxBetPercent, balance, minBets, myRank, validBetsCount, onClear }: {
  matchId: string; canBet: boolean; market: Market | null; selection: string | null; teams: { team_home: string; team_away: string }; stake: number; setStake: (v: number) => void; maxBet: number; maxBetPercent: number; balance: number; minBets: number; myRank?: number; validBetsCount: number; onClear: () => void
}) {
  const queryClient = useQueryClient()
  // Floor once, up front — every displayed number (potential return, quick-
  // stake highlight, button label, max-limit check) and the submitted
  // payload must agree on the same integer value.
  const effectiveStake = Math.max(0, Math.floor(stake))

  const placeBet = useMutation({
    mutationFn: async () => {
      if (!market || !selection) throw new Error('Pick an option first')
      if (market.void || !market.is_open) throw new Error('This market is no longer open for betting')
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
      toast.success('Bet placed successfully!')
      onClear()
      queryClient.invalidateQueries({ queryKey: ['fifa-dashboard'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const quickStakes = [10, 25, 50, 100].filter((s) => s <= maxBet)

  if (!canBet) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center opacity-50">
        <p className="text-sm font-medium text-muted-foreground">Betting slip unavailable</p>
      </div>
    )
  }

  if (!market || !selection) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center flex flex-col items-center justify-center min-h-[300px]">
        <div className="w-16 h-16 rounded-full bg-muted/20 flex items-center justify-center mb-4 border border-border">
          <span className="text-2xl opacity-50">🎫</span>
        </div>
        <h3 className="font-display text-xl text-foreground mb-2">Betting Slip</h3>
        <p className="text-sm text-muted-foreground max-w-[200px]">Select an option from the markets to place a bet.</p>
      </div>
    )
  }

  if (market.void || !market.is_open) {
    return (
      <div className="rounded-xl border border-ieee-danger/30 bg-ieee-danger/5 p-8 text-center flex flex-col items-center justify-center min-h-[300px]">
        <h3 className="font-display text-xl text-foreground mb-2">Betting Slip</h3>
        <p className="text-sm text-ieee-danger font-medium mb-4">
          {market.void ? 'This market has been voided.' : 'This market just closed.'}
        </p>
        <button onClick={onClear} className="text-xs font-semibold text-muted-foreground hover:text-foreground">Pick another option</button>
      </div>
    )
  }

  const odds = (market.mode === 'fixed' && market.fixed_odds) ? market.fixed_odds[selection] : null
  const potentialReturn = odds ? Math.round(effectiveStake * odds) : null

  return (
    <div className="rounded-xl border border-border bg-card shadow-xl overflow-hidden flex flex-col">
      <div className="bg-ieee-blue/10 border-b border-border p-4 flex items-center justify-between">
        <h3 className="font-display text-lg text-foreground">Betting Slip</h3>
        <button onClick={onClear} className="text-xs font-semibold text-muted-foreground hover:text-foreground">Clear</button>
      </div>
      
      <div className="p-5 flex-1 space-y-5">
        <div className="rounded-lg bg-[#111113] border border-border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">{FIFA_MARKET_LABELS[market.market_type] || market.market_type}</p>
          <div className="flex items-center justify-between">
            <p className="text-base font-bold text-foreground">
              {formatMarketOptionLabel(market.market_type, selection, teams, market.line)}
            </p>
            {odds && <p className="font-mono text-sm font-bold text-ieee-light-blue">{odds.toFixed(2)}×</p>}
            {market.mode === 'pool' && <p className="text-[10px] font-mono text-muted-foreground uppercase bg-muted px-2 py-1 rounded">Pool</p>}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-foreground">Stake Amount</label>
            <span className="text-xs text-muted-foreground">Max: {maxBet}</span>
          </div>
          <div className="relative">
            <input
              type="number"
              min={1}
              step={1}
              max={maxBet || undefined}
              value={stake}
              onChange={(e) => {
                const n = Number(e.target.value)
                setStake(Number.isNaN(n) ? 0 : Math.floor(n))
              }}
              className="w-full rounded-lg border border-border bg-[#111113] px-4 py-3 text-lg font-mono font-bold text-foreground focus:border-ieee-blue focus:ring-1 focus:ring-ieee-blue transition-colors"
            />
          </div>
        </div>

        {quickStakes.length > 0 && (
          <div className="flex gap-2">
            {quickStakes.map((s) => (
              <button
                key={s}
                onClick={() => setStake(s)}
                className={`flex-1 rounded-md py-2 text-xs font-mono font-bold transition-colors ${
                  effectiveStake === s
                    ? 'bg-ieee-blue text-white shadow-md'
                    : 'bg-[#111113] border border-border text-muted-foreground hover:border-ieee-light-blue hover:text-foreground'
                }`}
              >
                +{s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-[#111113] p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-muted-foreground">Potential Return</span>
          {potentialReturn !== null ? (
            <span className="font-mono text-lg font-bold text-ieee-light-blue">{potentialReturn} tickets</span>
          ) : (
            <span className="text-xs text-muted-foreground italic">Share of pool</span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mb-2 text-center">
          Max stake {maxBetPercent}% of your tickets ({balance.toLocaleString()}).
          {myRank != null && (
            <> · Leaderboard rank <span className="font-semibold text-foreground">#{myRank}</span></>
          )}
        </p>
        {myRank != null && validBetsCount >= minBets && (
          <p className="text-[10px] text-muted-foreground/80 mb-4 text-center">
            Prize draw is weighted by rank — #1 does not automatically win the voucher.
          </p>
        )}
        {myRank != null && validBetsCount < minBets && (
          <p className="text-[10px] text-muted-foreground mb-4 text-center">
            Place {minBets - validBetsCount} more bet{minBets - validBetsCount === 1 ? '' : 's'} to enter the prize draw (rank #{myRank}).
          </p>
        )}
        {myRank == null && (
          <p className="text-[10px] text-muted-foreground mb-4 text-center">
            Place bets to appear on the leaderboard. Need {minBets} bets to enter the prize draw.
          </p>
        )}
        <button
          onClick={() => {
            if (balance <= 0) return toast.error('Not enough tickets to place a bet')
            if (effectiveStake <= 0) return toast.error('Please enter a stake amount')
            if (effectiveStake > maxBet) return toast.error(`Max bet is ${maxBet} tickets (${maxBetPercent}% of your tickets)`)
            placeBet.mutate()
          }}
          disabled={placeBet.isPending}
          className="w-full rounded-lg bg-ieee-blue px-4 py-4 text-sm font-bold text-white hover:bg-ieee-light-blue hover:-translate-y-0.5 transition-all shadow-lg disabled:opacity-50 disabled:hover:translate-y-0 flex items-center justify-center"
        >
          {placeBet.isPending ? (
            <span className="flex items-center gap-2"><span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> Processing</span>
          ) : (
            `Place Bet · ${effectiveStake} tickets`
          )}
        </button>
      </div>
    </div>
  )
}