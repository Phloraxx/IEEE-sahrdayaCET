import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { AdminFifaTagInput } from "@/features/fifa/admin-market-management"
import { listAdminFifaMarkets, settleFifaMatch, type AdminFifaMatchRecord } from "@/lib/data/admin-fifa.client"
import { fetchFifaLiveScores, findLiveMatch } from "@/lib/fifa-live-match"
import {
  buildFifaSettlementPayload,
  isFifaKnockoutStage,
  resultWinnerFromScore,
  type FifaAdminAdvanceSide,
  type FifaAdminResultWinner,
  type FifaAdminSettlementFormState,
} from "@/lib/fifa-admin-settlement"
import { FifaSettleSchema } from "@/schemas/fifa"
import { toast } from "sonner"

export function AdminFifaSettlementSection({ match }: { match: AdminFifaMatchRecord }) {
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
            {isFifaKnockoutStage(match.stage) && match.result_advance && <span className="ml-2">· Advanced: {match.result_advance}</span>}
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

      <AdminFifaSettleForm
        matchId={match.id}
        stage={match.stage}
        teamHome={match.team_home}
        teamAway={match.team_away}
      />
    </section>
  )
}

function AdminFifaSettleForm({
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

  const [form, setForm] = useState<FifaAdminSettlementFormState>({
    result_winner: 'home',
    result_advance: 'home',
    result_home_goals: 0,
    result_away_goals: 0,
    result_scorers: [] as string[],
    result_yellow_cards: 0,
    result_red_cards: 0,
    result_after_extra_time: false,
    result_after_penalties: false,
    custom_winners: {} as Record<string, string[]>,
  })

  // When the 90-min result isn't a draw, result_advance auto-fills to the
  // winner and the "who advanced" select disables.
  const isDraw = form.result_winner === 'draw'
  const isKnockout = isFifaKnockoutStage(stage)

  const autoFill = useMutation({
    mutationFn: () => fetchFifaLiveScores({ throwOnError: true }),
    onSuccess: (data) => {
      if (!data.configured) {
        toast.error('Live scores not configured (FOOTBALL_DATA_API_TOKEN not set)')
        return
      }
      const live = findLiveMatch(teamHome, teamAway, data.matches)
      if (!live || live.homeGoals === null || live.awayGoals === null) {
        toast.error('No live score found for this match yet')
        return
      }
      const winner = resultWinnerFromScore(live.homeGoals, live.awayGoals)
      setForm((current) => ({
        ...current,
        result_home_goals: live.homeGoals ?? 0,
        result_away_goals: live.awayGoals ?? 0,
        result_winner: winner,
        result_advance: winner === 'draw' ? current.result_advance : winner,
      }))
      toast.success('Auto-filled from live score')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const settle = useMutation({
    mutationFn: async () => {
      const payload = buildFifaSettlementPayload({ matchId, stage, form })
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
      queryClient.invalidateQueries({ queryKey: ['admin-fifa-match', matchId] })
      queryClient.invalidateQueries({ queryKey: ['admin-fifa-markets', matchId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <form onSubmit={(e) => { e.preventDefault(); settle.mutate() }} className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">Enter the final result to settle all markets. Idempotent — re-running is safe.</p>
        <Button type="button" size="sm" variant="outline" onClick={() => autoFill.mutate()} disabled={autoFill.isPending}>
          {autoFill.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Auto-fill live
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>90-minute result</Label>
          <Select value={form.result_winner} onValueChange={(value) => {
            const winner = value as FifaAdminResultWinner
            setForm({ ...form, result_winner: winner, result_advance: winner !== 'draw' ? winner : form.result_advance })
          }}>
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
            <Select value={form.result_advance} onValueChange={(value) => setForm({ ...form, result_advance: value as FifaAdminAdvanceSide })}>
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

      {isKnockout && (
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
      )}

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
