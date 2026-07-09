import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { ChevronDown, ChevronUp, Loader2, Plus, Trophy } from "lucide-react"
import { PanelHeader } from "@/components/admin/panel-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { FIFA_MARKET_LABELS, FifaMarketCreateSchema, FifaSettleSchema } from "@/schemas/fifa"

export const Route = createFileRoute("/admin/FIFA/matches")({
  component: AdminFifaMatches,
  errorComponent: ({ error }: { error: Error }) => (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <div className="mx-auto max-w-md text-center">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-destructive">Error</p>
        <h1 className="mb-2 text-xl font-semibold tracking-tight">{error?.message ?? "Something went wrong"}</h1>
        <button type="button" onClick={() => window.location.reload()} className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">Try again</button>
      </div>
    </div>
  ),
})

interface MatchRow {
  id: string
  team_home: string
  team_away: string
  stage: string
  kickoff_at: string
  status: string
  settled: boolean
  result_winner?: string
  result_home_goals?: number
  result_away_goals?: number
  result_advance?: string
  result_after_extra_time?: boolean
  result_after_penalties?: boolean
}

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
}

async function fetchMatches(): Promise<{ matches: MatchRow[] }> {
  const res = await fetch('/api/admin/fifa/matches?perPage=100')
  if (!res.ok) throw new Error('Failed to load matches')
  return res.json()
}

function AdminFifaMatches() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-fifa-matches'], queryFn: fetchMatches })
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div>
      <PanelHeader
        eyebrow="WC Predict '26"
        title="Matches"
        description="Matches are synced from live data. Manage markets and settle results here."
      />

      {isLoading && <Skeleton className="h-32 w-full" />}
      {data && data.matches.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Trophy className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No matches synced yet.</p>
        </div>
      )}

      <div className="space-y-3">
        {data?.matches.map((m) => (
          <MatchItem 
            key={m.id} 
            match={m} 
            isExpanded={expandedId === m.id} 
            onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)} 
          />
        ))}
      </div>
    </div>
  )
}

function StatusBadge({ status, settled }: { status: string; settled: boolean }) {
  if (settled) return <Badge variant="secondary">Settled</Badge>
  const variant = status === 'live' ? 'destructive' : status === 'finished' ? 'secondary' : 'outline'
  return <Badge variant={variant}>{status}</Badge>
}

function MatchItem({ match, isExpanded, onToggle }: { match: MatchRow; isExpanded: boolean; onToggle: () => void }) {
  return (
    <div className={`rounded-lg border bg-card overflow-hidden transition-colors ${isExpanded ? 'border-primary/50' : 'hover:border-primary/50'}`}>
      <div 
        className="flex items-center justify-between p-4 cursor-pointer select-none"
        onClick={onToggle}
      >
        <div className="min-w-0">
          <p className="font-medium truncate">{match.team_home} vs {match.team_away}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {match.stage.toUpperCase()} · {match.kickoff_at ? new Date(match.kickoff_at).toLocaleString() : '—'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={match.status} settled={match.settled} />
          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>
      
      {isExpanded && (
        <div className="p-4 pt-0 border-t bg-muted/20">
          <div className="grid gap-6 lg:grid-cols-2 mt-4">
            <MarketsSection matchId={match.id} />
            <SettleSection match={match} />
          </div>
        </div>
      )}
    </div>
  )
}

function MarketsSection({ matchId }: { matchId: string }) {
  const { data, isLoading } = useQuery({ 
    queryKey: ['admin-fifa-markets', matchId], 
    queryFn: async () => {
      const res = await fetch(`/api/admin/fifa/markets?match=${matchId}`)
      if (!res.ok) throw new Error('Failed to load markets')
      return res.json() as Promise<{ markets: MarketRow[] }>
    }
  })

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Markets</h3>
        <CreateMarketDialog matchId={matchId} />
      </div>
      {isLoading && <Skeleton className="h-32 w-full" />}
      {data?.markets.length === 0 && (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-6 text-center">No markets yet.</p>
      )}
      <div className="space-y-2">
        {data?.markets.map((m) => (
          <MarketCard key={m.id} market={m} />
        ))}
      </div>
    </section>
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
      toast.success('Market voided — pending bets refunded')
      queryClient.invalidateQueries({ queryKey: ['admin-fifa-markets', market.match] })
      setOpen(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-sm font-medium">{FIFA_MARKET_LABELS[market.market_type as keyof typeof FIFA_MARKET_LABELS] || market.market_type}</p>
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

function TagInput({ tags, setTags, placeholder }: { tags: string[]; setTags: (t: string[]) => void; placeholder?: string }) {
  const [val, setVal] = useState('')
  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        {tags.map((t, i) => (
          <Badge key={i} variant="secondary" className="flex items-center gap-1">
            {t} 
            <button 
              type="button" 
              onClick={() => setTags(tags.filter((_, j) => j !== i))} 
              className="hover:text-destructive focus:outline-none"
            >&times;</button>
          </Badge>
        ))}
      </div>
      <Input 
        value={val} 
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            const trimmed = val.trim()
            if (trimmed && !tags.includes(trimmed)) {
              setTags([...tags, trimmed])
              setVal('')
            }
          }
        }}
        placeholder={placeholder || 'Type and press Enter or comma'} 
      />
    </div>
  )
}

function CreateMarketDialog({ matchId }: { matchId: string }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const initialForm = {
    market_type: 'match_winner',
    mode: 'pool',
    line: 0,
    options: [] as string[],
    fixed_odds_json: '{\n  "home": 1.5,\n  "draw": 3.2,\n  "away": 4.5\n}',
  }
  const [form, setForm] = useState(initialForm)

  const create = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        match: matchId,
        market_type: form.market_type,
        mode: form.mode,
        options: form.options,
        is_open: true,
      }
      if (form.market_type === 'total_goals_ou' || form.market_type === 'cards_ou') {
        body.line = Number(form.line)
      }
      if (form.mode === 'fixed') {
        try {
          body.fixed_odds = JSON.parse(form.fixed_odds_json)
        } catch (e) {
          throw new Error('Invalid JSON in fixed odds')
        }
      }

      // Validate with schema
      const parsed = FifaMarketCreateSchema.safeParse(body)
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', '))
      }

      const res = await fetch('/api/admin/fifa/markets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
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
        <form onSubmit={(e) => { e.preventDefault(); create.mutate() }} className="space-y-4 pt-2">
          <div>
            <Label>Market type</Label>
            <Select value={form.market_type} onValueChange={(v: any) => setForm({ ...form, market_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(FIFA_MARKET_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Mode</Label>
            <Select value={form.mode} onValueChange={(v: any) => setForm({ ...form, mode: v })}>
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
            <Label>Options</Label>
            <TagInput tags={form.options} setTags={(t) => setForm({ ...form, options: t })} placeholder="e.g. home, then Enter" />
          </div>
          {form.mode === 'fixed' && (
            <div>
              <Label>Fixed odds (JSON)</Label>
              <Textarea 
                className="font-mono text-sm h-32" 
                value={form.fixed_odds_json} 
                onChange={(e) => setForm({ ...form, fixed_odds_json: e.target.value })} 
                placeholder='{"home": 1.5, "away": 4.2}'
              />
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

function SettleSection({ match }: { match: MatchRow }) {
  if (match.status !== 'live' && match.status !== 'finished' && !match.settled) {
    return (
      <section>
        <h3 className="text-sm font-semibold mb-3">Settlement</h3>
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-6 text-center">
          Match is {match.status}. You can only settle live or finished matches.
        </p>
      </section>
    )
  }

  if (match.settled) {
    return (
      <section>
        <h3 className="text-sm font-semibold mb-3">Settlement</h3>
        <div className="rounded-lg border bg-card p-4 text-sm">
          <p className="font-medium mb-2">Match settled</p>
          <p className="text-muted-foreground">
            90-min: {String(match.result_winner || '—')} · {match.result_home_goals ?? 0}-{match.result_away_goals ?? 0}
            {match.result_advance && <span className="ml-2">· Advanced: {match.result_advance}</span>}
            {match.result_after_penalties && <span className="ml-2">(Pens)</span>}
            {match.result_after_extra_time && !match.result_after_penalties && <span className="ml-2">(AET)</span>}
          </p>
        </div>
      </section>
    )
  }

  return (
    <section>
      <h3 className="text-sm font-semibold mb-3">Settlement</h3>
      <SettleForm matchId={match.id} stage={match.stage} />
    </section>
  )
}

function SettleForm({ matchId, stage }: { matchId: string, stage: string }) {
  const queryClient = useQueryClient()

  const { data: marketsData } = useQuery({ 
    queryKey: ['admin-fifa-markets', matchId], 
    queryFn: async () => {
      const res = await fetch(`/api/admin/fifa/markets?match=${matchId}`)
      if (!res.ok) return { markets: [] }
      return res.json() as Promise<{ markets: MarketRow[] }>
    }
  })

  const customMarkets = marketsData?.markets.filter(m => m.market_type === 'custom') || []

  const [form, setForm] = useState({
    result_winner: 'home',
    result_advance: 'home',
    result_home_goals: 0,
    result_away_goals: 0,
    result_scorers: [] as string[],
    result_yellow_cards: 0,
    result_red_cards: 0,
    result_home_clean_sheet: false,
    result_away_clean_sheet: false,
    result_after_extra_time: false,
    result_after_penalties: false,
    custom_winners: {} as Record<string, string[]>,
  })

  // When the 90-min result isn't a draw, result_advance auto-fills to the
  // winner and the "who advanced" select disables.
  const isDraw = form.result_winner === 'draw'
  const isKnockout = stage !== 'r32' // Assume groups is r32 or handled elsewhere, adjust if needed
  const effectiveAdvance = isDraw ? form.result_advance : form.result_winner

  const settle = useMutation({
    mutationFn: async () => {
      const payload = {
        matchId,
        result_winner: form.result_winner,
        result_advance: (isKnockout && effectiveAdvance) ? effectiveAdvance : undefined,
        result_home_goals: Number(form.result_home_goals),
        result_away_goals: Number(form.result_away_goals),
        result_scorers: form.result_scorers,
        result_yellow_cards: Number(form.result_yellow_cards),
        result_red_cards: Number(form.result_red_cards),
        result_home_clean_sheet: form.result_home_clean_sheet,
        result_away_clean_sheet: form.result_away_clean_sheet,
        result_after_extra_time: form.result_after_extra_time,
        result_after_penalties: form.result_after_penalties,
        custom_winners: Object.keys(form.custom_winners).length > 0 ? form.custom_winners : undefined,
      }
      
      const parsed = FifaSettleSchema.safeParse(payload)
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', '))
      }

      const res = await fetch('/api/admin/fifa/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Settlement failed')
      }
      
      return data
    },
    onSuccess: (data) => {
      if (data.partial) {
        toast.warning(`Partial settlement: ${data.pendingRemaining} bets remain pending`)
      } else {
        toast.success(`Settled — ${data.settledCount} bets processed, ${data.totalPayout} pts paid out`)
      }
      queryClient.invalidateQueries({ queryKey: ['admin-fifa-matches'] })
      queryClient.invalidateQueries({ queryKey: ['admin-fifa-markets', matchId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <form onSubmit={(e) => { e.preventDefault(); settle.mutate() }} className="space-y-4 rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">Enter the final result to settle all markets. Idempotent — re-running is safe.</p>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>90-minute result</Label>
          <Select value={form.result_winner} onValueChange={(v) => setForm({ ...form, result_winner: v, result_advance: v !== 'draw' ? v : form.result_advance })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="home">Home win</SelectItem>
              <SelectItem value="away">Away win</SelectItem>
              <SelectItem value="draw">Draw</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isKnockout && isDraw && (
          <div>
            <Label>Who advanced? (ET/Pens)</Label>
            <Select value={form.result_advance} onValueChange={(v) => setForm({ ...form, result_advance: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="home">Home</SelectItem>
                <SelectItem value="away">Away</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
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
        <Label>Anytime scorers</Label>
        <TagInput tags={form.result_scorers} setTags={(t) => setForm({ ...form, result_scorers: t })} placeholder="e.g. Messi, then Enter" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Yellow cards</Label>
          <Input type="number" min={0} value={form.result_yellow_cards} onChange={(e) => setForm({ ...form, result_yellow_cards: Number(e.target.value) })} />
        </div>
        <div>
          <Label>Red cards</Label>
          <Input type="number" min={0} value={form.result_red_cards} onChange={(e) => setForm({ ...form, result_red_cards: Number(e.target.value) })} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.result_home_clean_sheet} onChange={(e) => setForm({ ...form, result_home_clean_sheet: e.target.checked })} />
          Home clean sheet
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.result_away_clean_sheet} onChange={(e) => setForm({ ...form, result_away_clean_sheet: e.target.checked })} />
          Away clean sheet
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.result_after_extra_time} onChange={(e) => setForm({ ...form, result_after_extra_time: e.target.checked })} />
          Went to extra time
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.result_after_penalties} onChange={(e) => setForm({ ...form, result_after_penalties: e.target.checked })} />
          Decided on penalties
        </label>
      </div>

      {customMarkets.length > 0 && (
        <div className="pt-2 mt-2 border-t space-y-4">
          <h4 className="font-semibold text-sm">Custom Markets</h4>
          {customMarkets.map(m => (
            <div key={m.id}>
              <Label>Winners for {m.options.join(', ')}</Label>
              <TagInput 
                tags={form.custom_winners[m.id] || []} 
                setTags={(t) => setForm(f => ({ ...f, custom_winners: { ...f.custom_winners, [m.id]: t } }))} 
                placeholder="Type winner option, then Enter" 
              />
            </div>
          ))}
        </div>
      )}

      <Button type="submit" disabled={settle.isPending} className="w-full">
        {settle.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Settle match
      </Button>
    </form>
  )
}
