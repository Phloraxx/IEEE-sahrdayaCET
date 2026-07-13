import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { createServerFn } from '@tanstack/react-start'
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react"
import { PanelHeader } from "@/components/admin/panel-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { formatMarketOptionLabel } from "@/lib/fifa-market-labels"

const checkAdminAccess = createServerFn().handler(async () => {
  const { authenticateAdmin } = await import('@/lib/admin-middleware')
  try {
    const { role } = await authenticateAdmin()
    if (role !== "admin") {
      throw redirect({ to: "/admin" })
    }
    return { ok: true }
  } catch (e) {
    if (e instanceof Response) throw e
    throw redirect({ to: '/' })
  }
})

// Admin testing console (FIFA-GAME.md §2.6). Lets the admin exercise the full
// bet→settle→payout flow without a live match, adjust balances, and reset
// the game for pre-launch testing.
export const Route = createFileRoute("/admin/FIFA/testing")({
  beforeLoad: async () => {
    await checkAdminAccess()
  },
  component: AdminFifaTesting,
})

interface MatchRow {
  id: string
  team_home: string
  team_away: string
  stage: string
  kickoff_at: string
  status: string
  settled: boolean
}

interface BetRow {
  id: string
  user: { id: string; display_name: string; email: string }
  selection: string
  stake: number
  mode: string
  odds_locked: number
  status: string
  payout: number
  placed_at: string
  match: { id: string; team_home: string; team_away: string } | null
  market: { id: string; market_type: string } | null
}

async function fetchMatches(): Promise<{ matches: MatchRow[] }> {
  const res = await fetch('/api/admin/fifa/matches?perPage=100')
  if (!res.ok) throw new Error('Failed to load matches')
  return res.json()
}

async function fetchBets(matchId: string): Promise<{ bets: BetRow[] }> {
  const res = await fetch(`/api/admin/fifa/bets?match=${matchId}`)
  if (!res.ok) throw new Error('Failed to load bets')
  return res.json()
}

function AdminFifaTesting() {
  const queryClient = useQueryClient()
  const { data: matchesData, isLoading } = useQuery({ queryKey: ['admin-fifa-matches'], queryFn: fetchMatches })
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null)

  const createTestMatch = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/fifa/testing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-test-match' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Test match created with 4 default markets')
      queryClient.invalidateQueries({ queryKey: ['admin-fifa-matches'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const createEspnTestMatch = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/fifa/testing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-espn-test-match' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed')
      }
      return res.json()
    },
    onSuccess: (data) => {
      toast.success(`ESPN test match (${data.team_home ?? 'France'} vs ${data.team_away ?? 'England'}) — ${data.status}, FT ${new Date(data.end_at).toLocaleTimeString()}`)
      queryClient.invalidateQueries({ queryKey: ['admin-fifa-matches'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const importFixtures = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/fifa/testing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import-fixtures' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed')
      }
      return res.json()
    },
    onSuccess: (data) => {
      toast.success(`Imported ${data.imported}, updated ${data.updated ?? 0}, skipped ${data.skipped}`)
      queryClient.invalidateQueries({ queryKey: ['admin-fifa-matches'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div>
      <div className="mb-6 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm font-medium text-destructive">
        <AlertTriangle className="h-4 w-4" />
        ⚠️ TESTING ONLY — These tools will directly mutate live balances and game state. Do not use in production.
      </div>
      <PanelHeader
        eyebrow="WC Predict '26"
        title="Testing Console"
        description="Exercise the full bet → settle → payout flow, adjust balances, and reset the game for pre-launch testing."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => importFixtures.mutate()} disabled={importFixtures.isPending}>
              {importFixtures.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Import WC fixtures
            </Button>
            <Button variant="outline" onClick={() => createEspnTestMatch.mutate()} disabled={createEspnTestMatch.isPending}>
              {createEspnTestMatch.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} ESPN test (FT 1:59 PM)
            </Button>
            <Button onClick={() => createTestMatch.mutate()} disabled={createTestMatch.isPending}>
              {createTestMatch.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} One-click test match
            </Button>
          </div>
        }
      />

      {/* Quick actions */}
      <div className="mb-6">
        <BalanceAdjustCard />
      </div>

      {/* Matches + bets */}
      <h3 className="text-sm font-semibold mb-3">Matches & bets</h3>
      {isLoading && <Skeleton className="h-32 w-full" />}
      {matchesData && matchesData.matches.length === 0 && (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-6 text-center">No matches yet. Use "One-click test match" above.</p>
      )}
      <div className="space-y-2">
        {matchesData?.matches.map((m) => (
          <div key={m.id} className="rounded-lg border bg-card">
            <button
              onClick={() => setExpandedMatch(expandedMatch === m.id ? null : m.id)}
              className="w-full flex items-center justify-between p-3 text-left"
            >
              <div>
                <p className="font-medium text-sm">{m.team_home} vs {m.team_away}</p>
                <p className="text-xs text-muted-foreground">{m.stage.toUpperCase()} · {new Date(m.kickoff_at).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={m.settled ? 'secondary' : m.status === 'live' ? 'destructive' : 'outline'}>{m.settled ? 'Settled' : m.status}</Badge>
                <Link to="/admin/FIFA/matches/$id/" params={{ id: m.id }} className="text-xs text-primary hover:underline" onClick={(e) => e.stopPropagation()}>Open →</Link>
              </div>
            </button>
            {expandedMatch === m.id && <MatchBets matchId={m.id} />}
          </div>
        ))}
      </div>

      {/* Danger zone */}
      <DangerZone />
    </div>
  )
}

function MatchBets({ matchId }: { matchId: string }) {
  const { data, isLoading } = useQuery({ queryKey: ['admin-fifa-bets', matchId], queryFn: () => fetchBets(matchId) })
  return (
    <div className="border-t px-3 py-2 bg-muted/30">
      {isLoading && <p className="text-xs text-muted-foreground py-2">Loading bets…</p>}
      {data && data.bets.length === 0 && <p className="text-xs text-muted-foreground py-2">No bets on this match.</p>}
      {data && data.bets.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1">Player</th>
              <th className="py-1">Market</th>
              <th className="py-1">Selection</th>
              <th className="py-1 text-right">Stake</th>
              <th className="py-1">Status</th>
              <th className="py-1 text-right">Payout</th>
            </tr>
          </thead>
          <tbody>
            {data.bets.map((b) => (
              <tr key={b.id} className="border-t border-border/50">
                <td className="py-1.5">{b.user.display_name || b.user.email || b.user.id}</td>
                <td className="py-1.5">{b.market?.market_type || '—'}</td>
                <td className="py-1.5">
                  {formatMarketOptionLabel(b.market?.market_type, b.selection, b.match)}
                </td>
                <td className="py-1.5 text-right font-mono">{b.stake}</td>
                <td className="py-1.5"><Badge variant="outline">{b.status}</Badge></td>
                <td className="py-1.5 text-right font-mono">{b.payout}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function BalanceAdjustCard() {
  const [userId, setUserId] = useState('')
  const [amount, setAmount] = useState(100)
  const [note, setNote] = useState('')
  const adjust = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/fifa/testing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'adjust-balance', userId, amount: Number(amount), note: note || undefined }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed')
      }
      return res.json()
    },
    onSuccess: (data) => {
      toast.success(`Balance adjusted — new balance: ${data.newBalance}`)
      setUserId('')
      setNote('')
    },
    onError: (e: Error) => toast.error(e.message),
  })
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold mb-2">Adjust balance</h3>
      <p className="text-xs text-muted-foreground mb-3">Grant or deduct tickets for any user (writes an admin_adjust ledger row).</p>
      <div className="space-y-2">
        <div>
          <Label htmlFor="userId">User ID</Label>
          <Input id="userId" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Paste a PocketBase user ID" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="amount">Amount (+/-)</Label>
            <Input id="amount" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="note">Note (optional)</Label>
            <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Testing top-up" />
          </div>
        </div>
        <Button size="sm" onClick={() => adjust.mutate()} disabled={adjust.isPending || !userId}>
          {adjust.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Apply
        </Button>
      </div>
    </div>
  )
}

function DangerZone() {
  const queryClient = useQueryClient()
  const [resetOpen, setResetOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  const reset = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/fifa/testing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset', confirm: confirmText }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Game reset complete')
      setResetOpen(false)
      setConfirmText('')
      queryClient.invalidateQueries({ queryKey: ['admin-fifa-matches'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="mt-8 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <h3 className="text-sm font-semibold text-destructive">Danger zone</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Reset the entire game: voids all bets, refunds all stakes, resets every user's balance to starting_balance, wipes transactions. For pre-launch testing only.</p>
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive" size="sm"><Trash2 className="mr-2 h-4 w-4" /> Reset game</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset the entire game?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will: delete all bets, delete all transactions, void all matches (clear results), close all markets, and reset every user's balance to starting_balance. <strong>This cannot be undone.</strong>
          </p>
          <div>
            <Label htmlFor="confirm">Type RESET to confirm</Label>
            <Input id="confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESET" />
          </div>
          <Button variant="destructive" onClick={() => reset.mutate()} disabled={reset.isPending || confirmText !== 'RESET'}>
            {reset.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Reset everything
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}