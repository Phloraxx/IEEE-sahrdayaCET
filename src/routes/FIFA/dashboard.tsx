
import { useQuery } from '@tanstack/react-query'
import { FifaLayout } from '@/features/fifa/fifa-layout'
import { useAuth } from '@/lib/auth-context'
import { formatDateTime, formatDateShort } from '@/lib/dates'
import { formatMarketOptionLabel } from '@/lib/fifa-market-labels'
import { fetchFifaDashboard } from '@/lib/fifa-dashboard-client'
import { Ticket, Trophy, Target, TrendingUp, History } from 'lucide-react'

async function fetchLeaderboardPayload(): Promise<{ settings?: { min_bets: number } }> {
  const res = await fetch('/pb/api/fifa/leaderboard')
  if (!res.ok) throw new Error('Failed to load leaderboard')
  return res.json()
}

export default function DashboardPage() {
  const { status, signIn } = useAuth()
  const { data, isLoading, error } = useQuery({
    queryKey: ['fifa-dashboard'],
    queryFn: fetchFifaDashboard,
    refetchInterval: 10_000,
    enabled: status === 'authenticated',
  })

  const { data: lbPayload } = useQuery({
    queryKey: ['fifa-leaderboard'],
    queryFn: fetchLeaderboardPayload,
    staleTime: 15_000,
    enabled: status === 'authenticated',
  })
  const minBets = lbPayload?.settings?.min_bets ?? 5

  if (status !== 'authenticated') {
    return (
      <FifaLayout active="dashboard">
        <div className="w-full flex-1 flex flex-col items-center justify-center bg-[#0a0a0b] py-20 px-4">
          <div className="rounded-2xl border border-border bg-card p-10 text-center max-w-md w-full shadow-2xl">
            <Trophy className="w-16 h-16 text-ieee-blue mx-auto mb-6 opacity-80" />
            <h1 className="font-display text-3xl text-foreground mb-3 uppercase tracking-wider">Your Dashboard</h1>
            <p className="text-muted-foreground mb-8">Sign in with your @sahrdaya.ac.in account to view your tickets, betting history, and prize draw status.</p>
            <button onClick={signIn} className="w-full py-3 rounded-lg bg-ieee-blue text-white text-base font-bold hover:bg-ieee-light-blue transition-colors shadow-lg hover:-translate-y-0.5">
              Sign in with Google
            </button>
          </div>
        </div>
      </FifaLayout>
    )
  }

  if (isLoading || !data) {
    const errorMessage = error instanceof Error ? error.message : ''
    return (
      <FifaLayout active="dashboard">
        <div className="w-full flex-1 flex flex-col bg-[#0a0a0b] py-12 px-4">
          <div className="mx-auto w-full max-w-7xl">
            {errorMessage ? (
              <div className="rounded-xl border border-ieee-danger/30 bg-ieee-danger/10 p-8 text-center max-w-md mx-auto">
                <p className="text-ieee-danger font-bold text-lg mb-2">Failed to load dashboard</p>
                <p className="text-sm text-muted-foreground mb-6">{errorMessage}</p>
                <button
                  onClick={() => signIn()}
                  className="rounded-lg bg-ieee-danger px-6 py-2 text-sm font-bold text-white hover:bg-red-600 transition-colors"
                >
                  Sign in again
                </button>
              </div>
            ) : (
              <div className="animate-pulse space-y-8">
                <div className="h-40 bg-card rounded-xl border border-border"></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="h-64 bg-card rounded-xl border border-border"></div>
                  <div className="h-64 bg-card rounded-xl border border-border"></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </FifaLayout>
    )
  }

  // Calculate Quick Stats
  const wonBets = data.bets.filter(b => b.status === 'won').length
  const lostBets = data.bets.filter(b => b.status === 'lost').length
  const totalResolved = wonBets + lostBets
  const winRate = totalResolved > 0 ? Math.round((wonBets / totalResolved) * 100) : 0
  const validBetsCount = data.valid_bets_count ?? 0
  const raffleProgress = minBets > 0 ? Math.min(100, (validBetsCount / minBets) * 100) : 100
  const betsToQualify = Math.max(0, minBets - validBetsCount)

  return (
    <FifaLayout active="dashboard">
      <div className="w-full flex-1 flex flex-col bg-[#0a0a0b]">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-4 md:py-6 space-y-8">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="font-display text-4xl text-foreground uppercase tracking-tight">Commander Center</h1>
              <p className="text-muted-foreground text-sm">Your tickets, bets, and leaderboard rank — one scoreboard.</p>
            </div>
            <div className="flex items-center bg-card/50 border border-border px-4 py-2 rounded-lg">
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Playing As</span>
                <span className="text-sm font-bold text-foreground">{data.user.display_name || '(unset)'}</span>
              </div>
            </div>
          </div>

          {betsToQualify > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90">
              <strong className="text-amber-400">Prize draw:</strong> Place {betsToQualify} more bet{betsToQualify === 1 ? '' : 's'} to qualify (need {minBets} total).
            </div>
          )}

          {/* TOP SECTION: Balance & Quick Stats */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-ieee-light-blue/20 bg-gradient-to-br from-[#111113] to-ieee-light-blue/10 p-8 flex flex-col justify-center relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-ieee-light-blue/10 rounded-full blur-[50px] -translate-y-1/2 translate-x-1/4" />
              <div className="relative z-10">
                <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ieee-light-blue mb-2 font-bold flex items-center gap-2">
                  <Target className="w-4 h-4" /> Your tickets
                </p>
                <div className="flex items-baseline gap-3">
                  <p className="font-display text-6xl md:text-7xl text-foreground tracking-tight">{data.user.balance.toLocaleString()}</p>
                  <p className="text-xl text-muted-foreground font-mono">tickets</p>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-card p-6 flex flex-col justify-center">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Total Bets</p>
                <p className="font-mono text-3xl font-bold text-foreground">{data.bets.length}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-6 flex flex-col justify-center">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Win Rate</p>
                <div className="flex items-center gap-2">
                  <p className="font-mono text-3xl font-bold text-foreground">{winRate}%</p>
                  {winRate > 50 && <TrendingUp className="w-5 h-5 text-ieee-success" />}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-6 flex flex-col justify-center">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Won</p>
                <p className="font-mono text-3xl font-bold text-ieee-success">{wonBets}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-6 flex flex-col justify-center">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Lost</p>
                <p className="font-mono text-3xl font-bold text-ieee-danger">{lostBets}</p>
              </div>
            </div>
          </section>

          {/* MIDDLE SECTION: Recent Bets & Raffle */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Recent Bets */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col h-full max-h-[500px]">
              <div className="p-5 border-b border-border flex items-center justify-between bg-[#111113]">
                <h2 className="font-display text-xl text-foreground uppercase tracking-wider">Recent Bets</h2>
                <span className="text-xs text-muted-foreground font-semibold">Last 5</span>
              </div>
              <div className="p-5 overflow-y-auto flex-1 custom-scrollbar">
                {data.bets.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-70">
                    <History className="w-10 h-10 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">No bets placed yet.</p>
                    <a href="/FIFA/matches" className="mt-3 text-xs font-semibold text-ieee-light-blue hover:underline">Go to Matches →</a>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.bets.slice(0, 5).map((b) => (
                      <div key={b.id} className="rounded-xl border border-border bg-[#0a0a0b] p-4 hover:border-ieee-light-blue/50 transition-colors">
                        <div className="flex items-start justify-between mb-2">
                          <div className="min-w-0 pr-4">
                            <span className="text-sm font-bold text-foreground block truncate">
                              {formatMarketOptionLabel(
                                b.market?.market_type,
                                b.selection,
                                b.match,
                              )}
                            </span>
                            <span className="text-[11px] text-muted-foreground block truncate">
                              {b.match ? `${b.match.team_home} vs ${b.match.team_away}` : 'Unknown Match'}
                            </span>
                          </div>
                          <BetStatusBadge status={b.status} payout={b.payout} />
                        </div>
                        <div className="flex items-center justify-between border-t border-border/50 pt-2 mt-2">
                          <span className="text-xs font-mono text-muted-foreground">{formatDateShort(b.placed_at)}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">{b.stake} tickets</span>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                              {b.mode === 'fixed' ? `${b.odds_locked.toFixed(2)}×` : 'pool'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Raffle Eligibility */}
            <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-card to-amber-500/5 p-8 flex flex-col h-full relative overflow-hidden">
              <div className="absolute -right-4 -bottom-4 opacity-5">
                <Ticket className="w-64 h-64 text-amber-500 transform rotate-12" />
              </div>
              
              <div className="relative z-10 flex-1 flex flex-col">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <Ticket className="w-5 h-5 text-amber-500" />
                  </div>
                  <h2 className="font-display text-2xl text-foreground uppercase tracking-wider">Prize draw</h2>
                </div>

                <div className="bg-[#0a0a0b] border border-border rounded-xl p-5 mb-6 text-center flex-1 flex flex-col justify-center">
                  <p className="text-sm text-muted-foreground mb-2">Valid bets placed</p>
                  <p className="font-mono text-5xl font-bold text-foreground mb-4">{validBetsCount} <span className="text-2xl text-muted-foreground">/ {minBets}</span></p>

                  <div className="w-full bg-muted rounded-full h-2.5 mb-2 overflow-hidden border border-border/50">
                    <div
                      className="bg-amber-500 h-2.5 rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${raffleProgress}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {validBetsCount >= minBets
                      ? <span className="text-amber-500 font-bold">You qualify for the prize draw.</span>
                      : `Place ${betsToQualify} more bets to qualify.`}
                  </p>
                </div>

                <p className="text-xs text-muted-foreground text-center">
                  Win more tickets to climb the leaderboard. The voucher winner is picked by a random draw weighted by rank — #1 does not automatically win.
                </p>
              </div>
            </div>

          </section>

          {/* BOTTOM SECTION: Transactions Table */}
          <section className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="p-5 md:p-6 border-b border-border bg-[#111113]">
              <h2 className="font-display text-xl text-foreground uppercase tracking-wider">Transaction History</h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-[#0a0a0b]/50">
                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type / Note</th>
                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Amount</th>
                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Tickets after</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {data.transactions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-sm text-muted-foreground italic">
                        No transactions yet.
                      </td>
                    </tr>
                  ) : (
                    data.transactions.map((t) => (
                      <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-4 text-xs font-mono text-muted-foreground whitespace-nowrap">
                          {formatDateTime(t.timestamp) || '—'}
                        </td>
                        <td className="p-4">
                          <p className="text-sm text-foreground font-medium">{t.note || t.type.replace(/_/g, ' ')}</p>
                        </td>
                        <td className="p-4 text-right">
                          <span className={`inline-flex items-center justify-end font-mono text-sm font-bold ${t.amount > 0 ? 'text-ieee-success' : t.amount < 0 ? 'text-ieee-danger' : 'text-foreground'}`}>
                            {t.amount > 0 ? '+' : ''}{t.amount}
                          </span>
                        </td>
                        <td className="p-4 text-right text-sm font-mono text-foreground font-semibold">
                          {t.balance_after}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

        </div>
      </div>
    </FifaLayout>
  )
}

function BetStatusBadge({ status, payout }: { status: string; payout: number }) {
  const styles: Record<string, string> = {
    pending: 'border-ieee-warning/50 bg-ieee-warning/10 text-ieee-warning',
    won: 'border-ieee-success/50 bg-ieee-success/10 text-ieee-success',
    lost: 'border-ieee-danger/50 bg-ieee-danger/10 text-ieee-danger',
    void: 'border-border bg-muted/50 text-muted-foreground',
  }
  const labels: Record<string, string> = {
    pending: 'Pending',
    won: `Won +${payout}`,
    lost: 'Lost',
    void: payout > 0 ? `Refunded +${payout}` : 'Voided',
  }
  return (
    <span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0 ${styles[status] || styles.pending}`}>
      {labels[status] || status}
    </span>
  )
}
