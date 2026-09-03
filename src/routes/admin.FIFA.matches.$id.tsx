import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getAdminFifaMatch, settleFifaMatch, type AdminFifaMatchRecord } from "@/lib/data/admin-fifa.client";
import { useState } from "react"
import { ArrowLeft, Loader2 } from "lucide-react"
import { PanelHeader } from "@/components/admin/panel-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { formatDateTime } from "@/lib/dates";
import { AdminFifaMarketsSection } from "@/features/fifa/admin-market-management";
import { fetchFifaLiveScores, findLiveMatch } from "@/lib/fifa-live-match";

type MatchData = AdminFifaMatchRecord

export default function AdminFifaMatchDetail() {
  const { id = "" } = useParams();
  const { data: matchData, isLoading } = useQuery({ queryKey: ['admin-fifa-match', id], queryFn: () => getAdminFifaMatch(id) })
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
            description={`Kickoff: ${match.kickoff_at ? formatDateTime(match.kickoff_at) : '—'}`}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Markets section */}
            <AdminFifaMarketsSection matchId={id} emptyMessage="No markets yet. Create one to open betting." />

            {/* Settle section */}
            <section>
              <h3 className="text-sm font-semibold mb-3">Settlement</h3>
              {match.settled ? (
                <div className="rounded-lg border bg-card p-4 text-sm">
                  <p className="font-medium mb-2">Match settled</p>
                  <p className="text-muted-foreground">
                    90-min: {match.result_winner === 'home' ? match.team_home : match.result_winner === 'away' ? match.team_away : match.result_winner || '—'} · {match.result_home_goals}-{match.result_away_goals}
                    {match.result_advance && <span className="ml-2">· Advanced: {match.result_advance}</span>}
                    {match.result_after_penalties && <span className="ml-2">(Pens)</span>}
                    {match.result_after_extra_time && !match.result_after_penalties && <span className="ml-2">(AET)</span>}
                  </p>
                </div>
              ) : (
                <SettleForm match={match} />
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

function SettleForm({ match }: { match: MatchData }) {
  const matchId = match.id
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
      return fetchFifaLiveScores({ throwOnError: true })
    },
    onSuccess: (data) => {
      if (!data.configured) {
        toast.error('Live scores not configured (FOOTBALL_DATA_API_TOKEN not set)')
        return
      }
      const lm = findLiveMatch(match.team_home, match.team_away, data.matches)
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
      return settleFifaMatch({
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
      })
    },
    onSuccess: (data) => {
      toast.success(`Settled — ${data.betsSettled} bets, ${data.totalPayout} tickets paid out`)
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
            <SelectItem value="home">{match.team_home} win (90 min)</SelectItem>
            <SelectItem value="away">{match.team_away} win (90 min)</SelectItem>
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
              <SelectItem value="home">{match.team_home} advanced</SelectItem>
              <SelectItem value="away">{match.team_away} advanced</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">Match Winner bets settle on this. Score markets stay on the 90-min result.</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{match.team_home} goals (90 min)</Label>
          <Input type="number" min={0} value={form.result_home_goals} onChange={(e) => setForm({ ...form, result_home_goals: Number(e.target.value) })} />
        </div>
        <div>
          <Label>{match.team_away} goals (90 min)</Label>
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
