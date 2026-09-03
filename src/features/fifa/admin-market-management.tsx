import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Loader2, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  createAdminFifaMarket,
  listAdminFifaMarkets,
  updateAdminFifaMarket,
  type AdminFifaMarketRecord,
} from "@/lib/data/admin-fifa.client"
import { FIFA_MARKET_LABELS, FifaMarketCreateSchema } from "@/schemas/fifa"
import type { FIFA_MARKET_MODE, FIFA_MARKET_TYPE } from "@/schemas/fifa"
import { toast } from "sonner"

export function AdminFifaMarketsSection({ matchId, emptyMessage = "No markets yet." }: { matchId: string; emptyMessage?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-fifa-markets', matchId],
    queryFn: () => listAdminFifaMarkets(matchId)
  })

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Markets</h3>
        <CreateMarketDialog matchId={matchId} />
      </div>
      {isLoading && <Skeleton className="h-32 w-full" />}
      {data?.markets.length === 0 && (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-6 text-center">{emptyMessage}</p>
      )}
      <div className="space-y-2">
        {data?.markets.map((m) => (
          <AdminFifaMarketCard key={m.id} market={m} />
        ))}
      </div>
    </section>
  )
}

function AdminFifaMarketCard({ market }: { market: AdminFifaMarketRecord }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const toggleOpen = useMutation({
    mutationFn: () => updateAdminFifaMarket(market.id, { is_open: !market.is_open }),
    onSuccess: () => {
      toast.success(market.is_open ? 'Market closed' : 'Market opened')
      queryClient.invalidateQueries({ queryKey: ['admin-fifa-markets', market.match] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const voidMarket = useMutation({
    mutationFn: () => updateAdminFifaMarket(market.id, { void: true, is_open: false }),
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

export function AdminFifaTagInput({ tags, setTags, placeholder }: { tags: string[]; setTags: (t: string[]) => void; placeholder?: string }) {
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
  type MarketType = (typeof FIFA_MARKET_TYPE)[number]
  type MarketMode = (typeof FIFA_MARKET_MODE)[number]
  const initialForm = {
    market_type: 'match_winner' as MarketType,
    mode: 'pool' as MarketMode,
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
        } catch {
          throw new Error('Invalid JSON in fixed odds')
        }
      }

      // Validate with schema
      const parsed = FifaMarketCreateSchema.safeParse(body)
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', '))
      }

      return createAdminFifaMarket(parsed.data as Record<string, unknown>)
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
            <Select value={form.market_type} onValueChange={(value) => setForm({ ...form, market_type: value as MarketType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(FIFA_MARKET_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Mode</Label>
            <Select value={form.mode} onValueChange={(value) => setForm({ ...form, mode: value as MarketMode })}>
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
            <AdminFifaTagInput tags={form.options} setTags={(t) => setForm({ ...form, options: t })} placeholder="e.g. home, then Enter" />
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
