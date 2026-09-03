
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { listAdminFifaMarkets, listAdminFifaMatches, settleFifaMatch } from "@/lib/data/admin-fifa.client";
import { useState } from "react"
import { ChevronDown, ChevronUp, Loader2, Trophy } from "lucide-react"
import { PanelHeader } from "@/components/admin/panel-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { FifaSettleSchema } from "@/schemas/fifa";
import { formatDateTime } from "@/lib/dates";
import { AdminFifaMarketsSection, AdminFifaTagInput } from "@/features/fifa/admin-market-management";

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


export default function AdminFifaMatches() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-fifa-matches'], queryFn: listAdminFifaMatches })
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
            {match.stage.toUpperCase()} · {match.kickoff_at ? formatDateTime(match.kickoff_at) : '—'}
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
            <AdminFifaMarketsSection matchId={match.id} />
            <SettleSection match={match} />
          </div>
        </div>
      )}
    </div>
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
            90-min: {match.result_winner === 'home' ? match.team_home : match.result_winner === 'away' ? match.team_away : match.result_winner || '—'} · {match.result_home_goals ?? 0}-{match.result_away_goals ?? 0}
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
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Settlement</h3>
      </div>

      <SettleForm
        matchId={match.id}
        stage={match.stage}
        teamHome={match.team_home}
        teamAway={match.team_away}
      />
    </section>
  )
}

function SettleForm({
  matchId,
  stage,
  teamHome,
  teamAway,
}: {
  matchId: string
  stage: string
  teamHome: string
  teamAway: string
}) {
  const queryClient = useQueryClient()

  const { data: marketsData } = useQuery({
    queryKey: ['admin-fifa-markets', matchId],
    queryFn: () => listAdminFifaMarkets(matchId).catch(() => ({ markets: [] }))
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
        throw new Error(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', '))
      }

      return settleFifaMatch(parsed.data as Record<string, unknown>)
    },
    onSuccess: (data) => {
      if (data.partial) {
        toast.warning(`Partial settlement: ${data.pendingRemaining} bets remain pending`)
      } else {
        toast.success(`Settled — ${data.settledCount} bets processed, ${data.totalPayout} tickets paid out`)
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
              <SelectItem value="home">{teamHome} win</SelectItem>
              <SelectItem value="away">{teamAway} win</SelectItem>
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
                <SelectItem value="home">{teamHome}</SelectItem>
                <SelectItem value="away">{teamAway}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>{teamHome} goals (90 min)</Label>
          <Input type="number" min={0} value={form.result_home_goals} onChange={(e) => setForm({ ...form, result_home_goals: Number(e.target.value) })} />
        </div>
        <div>
          <Label>{teamAway} goals (90 min)</Label>
          <Input type="number" min={0} value={form.result_away_goals} onChange={(e) => setForm({ ...form, result_away_goals: Number(e.target.value) })} />
        </div>
      </div>

      <div>
        <Label>Anytime scorers</Label>
        <AdminFifaTagInput tags={form.result_scorers} setTags={(t) => setForm({ ...form, result_scorers: t })} placeholder="e.g. Messi, then Enter" />
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
          {teamHome} clean sheet
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.result_away_clean_sheet} onChange={(e) => setForm({ ...form, result_away_clean_sheet: e.target.checked })} />
          {teamAway} clean sheet
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
              <AdminFifaTagInput
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
