import { createFileRoute } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Trophy } from "lucide-react"
import { PanelHeader } from "@/components/admin/panel-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { useState } from "react"

export const Route = createFileRoute("/admin/FIFA/raffle")({
  component: AdminFifaRaffle,
})

interface RaffleDraw {
  id: string
  drawn_at: string
  winner: string
  entries_snapshot: {
    total_tickets: number
    winning_pick: number
    entries: Array<{ user_id: string; display_name: string; rank: number; tickets: number; bets_count: number }>
  }
  seed: string
}

async function fetchDraws(): Promise<{ draws: RaffleDraw[] }> {
  const res = await fetch('/api/admin/fifa/raffle-draws')
  if (!res.ok) throw new Error('Failed to load draws')
  return res.json()
}

function AdminFifaRaffle() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-fifa-raffle-draws'], queryFn: fetchDraws })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const queryClient = useQueryClient()

  const draw = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/fifa/raffle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Raffle failed')
      }
      return res.json()
    },
    onSuccess: (data) => {
      toast.success(`Winner: ${data.winner.display_name} (rank #${data.winner.rank})`)
      queryClient.invalidateQueries({ queryKey: ['admin-fifa-raffle-draws'] })
      setConfirmOpen(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div>
      <PanelHeader
        eyebrow="WC Predict '26"
        title="Raffle"
        description="Weighted draw — higher leaderboard rank = more tickets. Everyone with the min bets gets at least 1."
        actions={
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogTrigger asChild>
              <Button disabled={Boolean(data?.draws.length)}><Trophy className="mr-2 h-4 w-4" /> Draw winner</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Run the raffle draw?</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground py-2">
                This picks a winner from the current leaderboard using the weighted formula. The full ticket list and winning pick are stored for transparency. This cannot be undone.
              </p>
              <Button onClick={() => draw.mutate()} disabled={draw.isPending}>
                {draw.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Run draw
              </Button>
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading && <Skeleton className="h-32 w-full" />}
      {data && data.draws.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Trophy className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No draws yet. Run the raffle when the tournament is over.</p>
        </div>
      )}

      <div className="space-y-3">
        {data?.draws.map((d) => {
          const winner = d.entries_snapshot?.entries?.find((e) => e.user_id === d.winner)
          return (
            <div key={d.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium">{winner?.display_name || 'Unknown'}</p>
                <Badge>{d.entries_snapshot?.total_tickets || 0} tickets</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Drawn {new Date(d.drawn_at).toLocaleString()} · pick #{d.entries_snapshot?.winning_pick} · {d.entries_snapshot?.entries?.length || 0} entries
              </p>
              <p className="text-xs text-muted-foreground mt-1 font-mono">seed: {d.seed}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
