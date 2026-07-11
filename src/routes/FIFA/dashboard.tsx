import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { FifaLayout } from '@/features/fifa/fifa-layout'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/dates'

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
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="font-display text-3xl text-ieee-blue mb-3">Your Dashboard</h1>
          <p className="text-muted-foreground mb-6">Sign in with your @sahrdaya.ac.in account to see your balance, bets, and history.</p>
          <button onClick={signIn} className="px-4 py-2 rounded-md bg-ieee-light-blue text-white text-sm font-medium hover:bg-ieee-blue transition-colors">Sign in with Google</button>
        </div>
      </FifaLayout>
    )
  }

  if (isLoading || !data) {
    const errorMessage = error instanceof Error ? error.message : ''
    return (
      <FifaLayout active="dashboard">
        <div className="mx-auto max-w-2xl px-4 py-8">
          {errorMessage ? (
            <div className="rounded-lg border border-border bg-card p-5 text-center">
              <p className="text-ieee-danger mb-2">Failed to load dashboard</p>
              <p className="text-sm text-muted-foreground mb-4">{errorMessage}</p>
              <button
                onClick={() => signIn()}
                className="rounded-md bg-ieee-light-blue px-4 py-2 text-sm font-medium text-white hover:bg-ieee-blue transition-colors"
              >
                Sign in again
              </button>
            </div>
          ) : (
            <p className="text-muted-foreground">Loading…</p>
          )}
        </div>
      </FifaLayout>
    )
  }

  return (
    <FifaLayout active="dashboard">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <DisplayNameEditor currentName={data.user.display_name} />

        {/* Balance */}
        <div className="rounded-lg border border-border bg-card p-5 mb-6 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">Your balance</p>
          <p className="font-display text-5xl text-ieee-blue">{data.user.balance.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground mt-1">points</p>
        </div>

        {/* Active bets */}
        <section className="mb-6">
          <h2 className="font-display text-xl text-foreground mb-3">Recent bets</h2>
          {data.bets.length === 0 ? (
            <p className="text-muted-foreground text-sm">No bets yet. <a href="/FIFA/matches/" className="text-ieee-light-blue hover:underline">Place your first bet →</a></p>
          ) : (
            <div className="space-y-2">
              {data.bets.map((b) => (
                <div key={b.id} className="rounded-md border border-border bg-card p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-foreground">{b.selection}</span>
                    <BetStatusBadge status={b.status} payout={b.payout} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {b.match ? `${b.match.team_home} vs ${b.match.team_away}` : ''} · {b.stake} pts · {b.mode === 'fixed' ? `${b.odds_locked.toFixed(2)}×` : 'pool'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Transactions */}
        <section>
          <h2 className="font-display text-xl text-foreground mb-3">Transaction history</h2>
          {data.transactions.length === 0 ? (
            <p className="text-muted-foreground text-sm">No transactions yet.</p>
          ) : (
            <div className="space-y-1">
              {data.transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm py-2 border-b border-border/50 last:border-0">
                  <div>
                    <p className="text-foreground">{t.note || t.type.replace(/_/g, ' ')}</p>
                    {formatDateTime(t.timestamp) && (
                      <p className="text-xs text-muted-foreground">{formatDateTime(t.timestamp)}</p>
                    )}
                  </div>
                  <span className={`font-mono ${t.amount >= 0 ? 'text-ieee-success' : 'text-ieee-danger'}`}>
                    {t.amount >= 0 ? '+' : ''}{t.amount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </FifaLayout>
  )
}

function BetStatusBadge({ status, payout }: { status: string; payout: number }) {
  const styles: Record<string, string> = {
    pending: 'bg-ieee-warning/10 text-ieee-warning',
    won: 'bg-ieee-success/10 text-ieee-success',
    lost: 'bg-ieee-danger/10 text-ieee-danger',
    void: 'bg-muted text-muted-foreground',
  }
  const labels: Record<string, string> = {
    pending: 'Pending',
    won: `Won +${payout}`,
    lost: 'Lost',
    void: 'Voided',
  }
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${styles[status] || styles.pending}`}>{labels[status] || status}</span>
}

function DisplayNameEditor({ currentName }: { currentName: string }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(currentName)
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim()
      if (trimmed.length < 2 || trimmed.length > 30) {
        throw new Error('Name must be between 2 and 30 characters.')
      }
      if (!/^[a-zA-Z0-9 \-_]+$/.test(trimmed)) {
        throw new Error('Only letters, numbers, spaces, hyphens and underscores allowed.')
      }
      const res = await fetch('/api/fifa/dashboard', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: trimmed }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update name')
      }
      return res.json()
    },
    onSuccess: (data) => {
      toast.success('Display name updated')
      setEditing(false)
      queryClient.setQueryData(['fifa-dashboard'], (old: any) => {
        if (!old) return old
        return { ...old, user: { ...old.user, display_name: data.display_name } }
      })
      queryClient.invalidateQueries({ queryKey: ['fifa-dashboard'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className="mb-8 rounded-lg border border-border bg-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      {editing ? (
        <div className="flex flex-1 items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm max-w-sm"
            placeholder="Your leaderboard alias (2-30 chars)"
            autoFocus
          />
          <button onClick={() => save.mutate()} disabled={save.isPending || name.trim().length < 2} className="rounded-md bg-ieee-blue px-4 py-2 text-sm font-medium text-white hover:bg-ieee-light-blue transition-colors disabled:opacity-50">Save</button>
          <button onClick={() => { setEditing(false); setName(currentName) }} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
        </div>
      ) : (
        <>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Playing As</p>
            <p className="font-display text-2xl text-foreground">{currentName || <span className="text-muted-foreground italic">Unnamed Player</span>}</p>
          </div>
          <button onClick={() => setEditing(true)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors whitespace-nowrap">Edit Name</button>
        </>
      )}
    </div>
  )
}
