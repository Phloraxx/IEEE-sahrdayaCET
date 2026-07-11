import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { FifaLayout } from '@/features/fifa/fifa-layout'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/dates'
import { Edit2, Check, X, Ticket, Trophy, Target, TrendingUp, History } from 'lucide-react'

interface DashboardData {
  user: { id: string; display_name: string; balance: number; email: string }
  bets: Array<{
    id: string
    selection: string
    stake: number
    mode: string
    odds_locked: number
    status: string
    payout: number
    placed_at: string
    match: { id: string; team_home: string; team_away: string } | null
    market: { id: string; market_type: string } | null
  }>
  transactions: Array<{
    id: string
    type: string
    amount: number
    balance_after: number
    note: string
    timestamp: string
  }>
}

async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch('/api/fifa/dashboard')
  if (!res.ok) throw new Error('Not authenticated')
  return res.json()
}

export const Route = createFileRoute('/FIFA/dashboard')({
  head: () => ({ meta: [{ title: "Dashboard · WC Predict '26" }] }),
  component: DashboardPage,
})

function DashboardPage() {
  const { status, signIn } = useAuth()
  const { data, isLoading, error } = useQuery({
    queryKey: ['fifa-dashboard'],
    queryFn: fetchDashboard,
    refetchInterval: 10_000,
    enabled: status === 'authenticated',
  })

  if (status !== 'authenticated') {
    return (
      <FifaLayout active="dashboard">
        <div className="w-full flex-1 flex flex-col items-center justify-center bg-[#0a0a0b] py-20 px-4">
          <div className="rounded-2xl border border-border bg-card p-10 text-center max-w-md w-full shadow-2xl">
            <Trophy className="w-16 h-16 text-ieee-blue mx-auto mb-6 opacity-80" />
            <h1 className="font-display text-3xl text-foreground mb-3 uppercase tracking-wider">Your Dashboard</h1>
            <p className="text-muted-foreground mb-8">Sign in with your @sahrdaya.ac.in account to view your balance, betting history, and raffle status.</p>
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
  const validBetsCount = data.bets.filter(b => b.status !== 'void').length
  const raffleProgress = Math.min(100, (validBetsCount / 5) * 100)

  return (
    <FifaLayout active="dashboard">
      <div className="w-full flex-1 flex flex-col bg-[#0a0a0b]">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 md:py-12 space-y-8">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="font-display text-4xl text-foreground uppercase tracking-tight">Commander Center</h1>
              <p className="text-muted-foreground text-sm">Manage your points, track your bets, and secure your raffle tickets.</p>
            </div>
            <DisplayNameEditor currentName={data.user.display_name} />
          </div>

          {/* TOP SECTION: Balance & Quick Stats */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-ieee-light-blue/20 bg-gradient-to-br from-[#111113] to-ieee-light-blue/10 p-8 flex flex-col justify-center relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-ieee-light-blue/10 rounded-full blur-[50px] -translate-y-1/2 translate-x-1/4" />
              <div className="relative z-10">
                <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ieee-light-blue mb-2 font-bold flex items-center gap-2">
                  <Target className="w-4 h-4" /> Available Balance
                </p>
                <div className="flex items-baseline gap-3">
                  <p className="font-display text-6xl md:text-7xl text-foreground tracking-tight">{data.user.balance.toLocaleString()}</p>
                  <p className="text-xl text-muted-foreground font-mono">pts</p>
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
                            <span className="text-sm font-bold text-foreground block truncate">{b.selection}</span>
                            <span className="text-[11px] text-muted-foreground block truncate">
                              {b.match ? `${b.match.team_home} vs ${b.match.team_away}` : 'Unknown Match'}
                            </span>
                          </div>
                          <BetStatusBadge status={b.status} payout={b.payout} />
                        </div>
                        <div className="flex items-center justify-between border-t border-border/50 pt-2 mt-2">
                          <span className="text-xs font-mono text-muted-foreground">{new Date(b.placed_at).toLocaleDateString()}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">{b.stake} pts</span>
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
                  <h2 className="font-display text-2xl text-foreground uppercase tracking-wider">Raffle Status</h2>
                </div>

                <div className="bg-[#0a0a0b] border border-border rounded-xl p-5 mb-8 text-center flex-1 flex flex-col justify-center">
                  <p className="text-sm text-muted-foreground mb-2">Valid Bets Placed</p>
                  <p className="font-mono text-5xl font-bold text-foreground mb-4">{validBetsCount} <span className="text-2xl text-muted-foreground">/ 5</span></p>
                  
                  <div className="w-full bg-muted rounded-full h-2.5 mb-2 overflow-hidden border border-border/50">
                    <div 
                      className="bg-amber-500 h-2.5 rounded-full transition-all duration-1000 ease-out" 
                      style={{ width: `${raffleProgress}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {validBetsCount >= 5 
                      ? <span className="text-amber-500 font-bold">You are eligible for the raffle! Keep betting to improve your rank.</span> 
                      : `Place ${5 - validBetsCount} more bets to qualify.`}
                  </p>
                </div>
                
                <p className="text-xs text-muted-foreground text-center">
                  At the end of the tournament, rank 1 receives 50 tickets. Decays down to 1 ticket for rank 26+. The winner receives the sponsor voucher!
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
                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Balance After</th>
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
                          {formatDateTime(t.timestamp) || new Date().toLocaleDateString()}
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
    void: 'Voided',
  }
  return (
    <span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0 ${styles[status] || styles.pending}`}>
      {labels[status] || status}
    </span>
  )
}

function DisplayNameEditor({ currentName }: { currentName: string }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(currentName)
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/fifa/dashboard', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: name }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update name')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Display name updated')
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: ['fifa-dashboard'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className="flex items-center gap-2">
      {editing ? (
        <div className="flex items-center gap-2 bg-card border border-border p-1.5 rounded-lg">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_\-\s]/g, ''))}
            maxLength={30}
            className="w-48 rounded-md bg-[#0a0a0b] border border-border px-3 py-1.5 text-sm font-medium text-foreground outline-none focus:border-ieee-light-blue transition-colors"
            placeholder="Your Alias"
            autoFocus
          />
          <button 
            onClick={() => save.mutate()} 
            disabled={save.isPending || name.trim().length < 2} 
            className="p-1.5 rounded bg-ieee-success/20 text-ieee-success hover:bg-ieee-success hover:text-white transition-colors disabled:opacity-50"
            title="Save"
          >
            <Check className="w-4 h-4" />
          </button>
          <button 
            onClick={() => { setEditing(false); setName(currentName) }} 
            className="p-1.5 rounded bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-card/50 border border-border px-4 py-2 rounded-lg group">
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Playing As</span>
            <span className="text-sm font-bold text-foreground">{currentName || '(unset)'}</span>
          </div>
          <button 
            onClick={() => setEditing(true)} 
            className="ml-2 p-1.5 rounded-md bg-transparent text-muted-foreground group-hover:bg-ieee-light-blue/10 group-hover:text-ieee-light-blue transition-colors"
            title="Edit Name"
          >
            <Edit2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
