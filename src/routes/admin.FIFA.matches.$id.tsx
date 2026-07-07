import { createFileRoute, Link } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { ArrowLeft, Loader2, Plus } from "lucide-react"
import { PanelHeader } from "@/components/admin/panel-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { FIFA_MARKET_LABELS } from "@/schemas/fifa"

export const Route = createFileRoute("/admin/FIFA/matches/$id")({
  component: AdminFifaMatchDetail,
  errorComponent: ({ error }: { error: Error }) => (
    <div className="flex min-h-[50vh] items-center justify-center p-8 text-center">
      <div className="mx-auto max-w-md">
        <h1 className="text-xl font-semibold mb-2">{error?.message ?? "Something went wrong"}</h1>
        <Link to="/admin/FIFA/matches/" className="text-sm text-primary hover:underline">← Back to matches</Link>
      </div>
    </div>
  ),
})

interface MarketRow {
  id: string
  match: string
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
  result_after_extra_time: boolean
  result_after_penalties: boolean
  settled: boolean
}

async function fetchMatch(id: string): Promise<{ match: MatchData }> {
  const res = await fetch(`/api/admin/fifa/matches/${id}`)
  if (!res.ok) throw new Error('Failed to load match')
  return res.json()
}

async function fetchMarkets(matchId: string): Promise<{ markets: MarketRow[] }> {
  const res = await fetch(`/api/admin/fifa/markets?match=${matchId}`)
  if (!res.ok) throw new Error('Failed to load markets')
  return res.json()
}

function AdminFifaMatchDetail() {
  const { id } = Route.useParams()
  const { data: matchData, isLoading } = useQuery({ queryKey: ['admin-fifa-match', id], queryFn: () => fetchMatch(id) })
  const { data: marketsData, isLoading: marketsLoading } = useQuery({ queryKey: ['admin-fifa-markets', id], queryFn: () => fetchMarkets(id) })
  const match = matchData?.match

  return (
    <div>
      <Link to="/admin/FIFA/matches/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> All matches
      </Link>

      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : match ? (
        <>
          <PanelHeader
            eyebrow={match.stage.toUpperCase()}
            title={`${match.team_home} vs ${match.team_away}`}
            description={`Kickoff: ${match.kickoff_at ? new Date(match.kickoff_at).toLocaleString() : '—'}`}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Markets section */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Markets</h3>
                <CreateMarketDialog matchId={id} />
              </div>
              {marketsLoading && <Skeleton className="h-32 w-full" />}
              {marketsData?.markets.length === 0 && (
                <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-6 text-center">No markets yet. Create one to open betting.</p>
              )}
              <div className="space-y-2">
                {marketsData?.markets.map((m) => (
                  <MarketCard key={m.id} market={m} />
                ))}
              </div>
            </section>

            {/* Settle section */}
            <section>
              <h3 className="text-sm font-semibold mb-3">Settlement</h3>
              {match.settled ? (
                <div className="rounded-lg border bg-card p-4 text-sm">
                  <p className="font-medium mb-2">Match settled</p>
                  <p className="text-muted-foreground">
                    90-min: {String(match.result_winner || '—')} · {match.result_home_goals}-{match.result_away_goals}
                    {match.result_advance && <span className="ml-2">· Advanced: {match.result_advance}</span>}
                    {match.result_after_penalties && <span className="ml-2">(Pens)</span>}
                    {match.result_after_extra_time && !match.result_after_penalties && <span className="ml-2">(AET)</span>}
                  </p>
                </div>
              ) : (
                <SettleForm matchId={id} />
              )}
            </section>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">Match not found.</p>
      )}
    </div>
  )
}

function MarketCard({ market }: { market: MarketRow }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const toggleOpen = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/fifa/markets/${market.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_open: !market.is_open }),
      })
      if (!res.ok) throw new Error('Failed to toggle')
      return res.json()
    },
    onSuccess: () => {
      toast.success(market.is_open ? 'Market closed' : 'Market opened')
      queryClient.invalidateQueries({ queryKey: ['admin-fifa-markets', market.match] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const voidMarket = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/fifa/markets/${market.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ void: true, is_open: false }),
      })
      if (!res.ok) throw new Error('Failed to void')
      return res.json()
    },
    onSuccess: () => {
      toast.success('Market voided — bets refunded')
      queryClient.invalidateQueries({ queryKey: ['admin-fifa-markets', market.match] })
      setOpen(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-sm font-medium">{FIFA_MARKET_LABELS[market.market_type] || market.market_type}</p>
          <p className="text-xs text-muted-foreground">
            {market.mode} · {market.options.length} options · pool {market.pool_total}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {market.void && <Badge variant="destructive">Voided</Badge>}
          {!market.void && <Badge variant={market.is_open ? 'default' : 'secondary'}>{market.is_open ? 'Open' : 'Closed'}</Badge>}
        </div>
      </div>
      <div className="flex gap-2">
        {!market.void && (
          <Button size="sm" variant="outline" onClick={() => toggleOpen.mutate()} disabled={toggleOpen.isPending}>
            {market.is_open ? 'Close' : 'Open'}
          </Button>
        )}
        {!market.void && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">Void</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Void this market?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground py-2">
                All pending bets will be refunded. This cannot be undone.
              </p>
              <Button variant="destructive" onClick={() => voidMarket.mutate()} disabled={voidMarket.isPending}>
                {voidMarket.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Void & refund
              </Button>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  )
}

const MARKET_OPTIONS_DEFAULT = 'home,away,draw'

function CreateMarketDialog({ matchId }: { matchId: string }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const initialForm = {
    market_type: 'match_winner',
    mode: 'pool',
    line: 0,
    optionsText: MARKET_OPTIONS_DEFAULT,
    fixedOddsText: '',
  }
  const [form, setForm] = useState(initialForm)

  const create = useMutation({
    mutationFn: async () => {
      const options = form.optionsText.split(',').map((s) => s.trim()).filter(Boolean)
      const body: Record<string, unknown> = {
        match: matchId,
        market_type: form.market_type,
        mode: form.mode,
        options,
        is_open: true,
      }
      if (form.line) body.line = Number(form.line)
      if (form.mode === 'fixed' && form.fixedOddsText) {
        const odds: Record<string, number> = {}
        for (const pair of form.fixedOddsText.split(',')) {
          const [opt, val] = pair.split(':').map((s) => s.trim())
          if (opt && val) odds[opt] = Number(val)
        }
        body.fixed_odds = odds
      }
      const res = await fetch('/api/admin/fifa/markets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create market')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Market created')
      queryClient.invalidateQueries({ queryKey: ['admin-fifa-markets', matchId] })
      setForm(initialForm)
      setOpen(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-1.5 h-4 w-4" /> Add market</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create market</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); create.mutate() }} className="space-y-3 pt-2">
          <div>
            <Label>Market type</Label>
            <Select value={form.market_type} onValueChange={(v) => setForm({ ...form, market_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(FIFA_MARKET_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Mode</Label>
            <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pool">Pool (pari-mutuel)</SelectItem>
                <SelectItem value="fixed">Fixed odds</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(form.market_type === 'total_goals_ou' || form.market_type === 'cards_ou') && (
            <div>
              <Label>Line (e.g. 2.5)</Label>
              <Input type="number" step="0.5" value={form.line} onChange={(e) => setForm({ ...form, line: Number(e.target.value) })} />
            </div>
          )}
          <div>
            <Label>Options (comma-separated)</Label>
            <Input value={form.optionsText} onChange={(e) => setForm({ ...form, optionsText: e.target.value })} placeholder="home,away,draw" />
          </div>
          {form.mode === 'fixed' && (
            <div>
              <Label>Fixed odds (option:odds, comma-separated)</Label>
              <Input value={form.fixedOddsText} onChange={(e) => setForm({ ...form, fixedOddsText: e.target.value })} placeholder="home:1.5,draw:3.2,away:4.5" />
            </div>
          )}
          <Button type="submit" disabled={create.isPending} className="w-full">
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create market
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SettleForm({ matchId }: { matchId: string }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    result_winner: 'home',
    result_advance: 'home',
    result_home_goals: 0,
    result_away_goals: 0,
    result_scorers: '',
    result_yellow_cards: 0,
    result_red_cards: 0,
    result_after_extra_time: false,
    result_after_penalties: false,
  })

  // When the 90-min result isn't a draw, result_advance auto-fills to the
  // winner and the "who advanced" select disables (FIFA-GAME.md §2.1).
  const isDraw = form.result_winner === 'draw'
  const effectiveAdvance = isDraw ? form.result_advance : form.result_winner

  // Auto-fill from live scores (football-data.org).
  const autoFill = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/fifa/live-scores')
      if (!res.ok) throw new Error('Live scores unavailable')
      return res.json() as Promise<{ matches: Array<{ homeTeam: string; awayTeam: string; homeGoals: number | null; awayGoals: number | null; status: string }>; configured: boolean }>
    },
    onSuccess: (data) => {
      if (!data.configured) {
        toast.error('Live scores not configured (FOOTBALL_DATA_API_TOKEN not set)')
        return
      }
      // Match by team names — the admin needs to be on the settle form for
      // the right match. We read the match from the parent query.
      const match = queryClient.getQueryData<{ match: MatchData }>(['admin-fifa-match', matchId])?.match
      if (!match) return
      const lm = data.matches.find((m) => {
        const h = m.homeTeam.trim().toLowerCase()
        const a = m.awayTeam.trim().toLowerCase()
        return (h === match.team_home.toLowerCase() && a === match.team_away.toLowerCase())
          || (h === match.team_away.toLowerCase() && a === match.team_home.toLowerCase())
      })
      if (!lm || lm.homeGoals === null || lm.awayGoals === null) {
        toast.error('No live score found for this match yet')
        return
      }
      const winner = lm.homeGoals > lm.awayGoals ? 'home' : lm.homeGoals < lm.awayGoals ? 'away' : 'draw'
      setForm((f) => ({
        ...f,
        result_home_goals: lm.homeGoals ?? 0,
        result_away_goals: lm.awayGoals ?? 0,
        result_winner: winner,
        result_advance: winner === 'draw' ? f.result_advance : winner,
      }))
      toast.success('Auto-filled from live score')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const settle = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/fifa/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId,
          result_winner: form.result_winner,
          result_advance: effectiveAdvance || undefined,
          result_home_goals: Number(form.result_home_goals),
          result_away_goals: Number(form.result_away_goals),
          result_scorers: form.result_scorers.split(',').map((s) => s.trim()).filter(Boolean),
          result_yellow_cards: Number(form.result_yellow_cards),
          result_red_cards: Number(form.result_red_cards),
          result_home_clean_sheet: form.result_away_goals === 0,
          result_away_clean_sheet: form.result_home_goals === 0,
          result_after_extra_time: form.result_after_extra_time,
          result_after_penalties: form.result_after_penalties,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Settlement failed')
      }
      return res.json()
    },
    onSuccess: (data) => {
      toast.success(`Settled — ${data.betsSettled} bets, ${data.totalPayout} pts paid out`)
      queryClient.invalidateQueries({ queryKey: ['admin-fifa-match', matchId] })
      queryClient.invalidateQueries({ queryKey: ['admin-fifa-markets', matchId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <form onSubmit={(e) => { e.preventDefault(); settle.mutate() }} className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Enter the final result to settle all markets and pay out bets. Idempotent — re-running is safe.</p>
        <Button type="button" size="sm" variant="outline" onClick={() => autoFill.mutate()} disabled={autoFill.isPending}>
          Auto-fill from live
        </Button>
      </div>
      <div>
        <Label>90-minute result</Label>
        <Select value={form.result_winner} onValueChange={(v) => setForm({ ...form, result_winner: v, result_advance: v !== 'draw' ? v : form.result_advance })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="home">Home win (90 min)</SelectItem>
            <SelectItem value="away">Away win (90 min)</SelectItem>
            <SelectItem value="draw">Draw (90 min)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {/* Who advanced — only editable when 90-min was a draw (knockout). */}
      {isDraw && (
        <div>
          <Label>Who advanced? (extra time / penalties)</Label>
          <Select value={form.result_advance} onValueChange={(v) => setForm({ ...form, result_advance: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="home">Home advanced</SelectItem>
              <SelectItem value="away">Away advanced</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">Match Winner bets settle on this. Score markets stay on the 90-min result.</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Home goals (90 min)</Label>
          <Input type="number" min={0} value={form.result_home_goals} onChange={(e) => setForm({ ...form, result_home_goals: Number(e.target.value) })} />
        </div>
        <div>
          <Label>Away goals (90 min)</Label>
          <Input type="number" min={0} value={form.result_away_goals} onChange={(e) => setForm({ ...form, result_away_goals: Number(e.target.value) })} />
        </div>
      </div>
      <div>
        <Label>Anytime scorers (comma-separated)</Label>
        <Input value={form.result_scorers} onChange={(e) => setForm({ ...form, result_scorers: e.target.value })} placeholder="Messi, Ronaldo" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Yellow cards</Label>
          <Input type="number" min={0} value={form.result_yellow_cards} onChange={(e) => setForm({ ...form, result_yellow_cards: Number(e.target.value) })} />
        </div>
        <div>
          <Label>Red cards</Label>
          <Input type="number" min={0} value={form.result_red_cards} onChange={(e) => setForm({ ...form, result_red_cards: Number(e.target.value) })} />
        </div>
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.result_after_extra_time} onChange={(e) => setForm({ ...form, result_after_extra_time: e.target.checked })} />
          Went to extra time
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.result_after_penalties} onChange={(e) => setForm({ ...form, result_after_penalties: e.target.checked })} />
          Decided on penalties
        </label>
      </div>
      <Button type="submit" disabled={settle.isPending} className="w-full">
        {settle.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Settle match
      </Button>
    </form>
  )
}
