import { createFileRoute } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, Loader2, Trophy, Info, PartyPopper } from "lucide-react"
import { PanelHeader } from "@/components/admin/panel-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { type FifaSettings } from "@/schemas/fifa"
import { fetchSettings } from "@/lib/api/fifa"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { useState, useEffect, useRef } from "react"

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

interface LeaderboardEntry {
  rank: number
  id: string
  display_name: string
  balance: number
  bets_count: number
}

async function fetchDraws(): Promise<{ draws: RaffleDraw[] }> {
  const res = await fetch('/api/admin/fifa/raffle-draws')
  if (!res.ok) throw new Error('Failed to load draws')
  return res.json()
}

async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const res = await fetch('/pb/api/fifa/leaderboard')
  if (!res.ok) throw new Error('Failed to load leaderboard')
  return res.json()
}

function AdminFifaRaffle() {
  const { data: drawsData, isLoading: drawsLoading } = useQuery({ queryKey: ['admin-fifa-raffle-draws'], queryFn: fetchDraws })
  const { data: lbData, isLoading: lbLoading } = useQuery({ queryKey: ['admin-fifa-leaderboard'], queryFn: fetchLeaderboard })
  const { data: settingsData, isLoading: settingsLoading } = useQuery({ queryKey: ['admin-fifa-settings'], queryFn: fetchSettings })
  const [settings, setSettings] = useState<FifaSettings | null>(null)
  const [winnerResult, setWinnerResult] = useState<any>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (settingsData) setSettings(settingsData)
  }, [settingsData])

  const runDraw = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/fifa/raffle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Raffle failed')
      }
      return data
    },
    onSuccess: (data) => {
      // Intentionally delay showing the winner so the animation can play out
      setTimeout(() => {
        setIsDrawing(false)
        setWinnerResult(data)
        toast.success(`Winner: ${data.winner.display_name}`)
        queryClient.invalidateQueries({ queryKey: ['admin-fifa-raffle-draws'] })
      }, 3000)
    },
    onError: (e: Error) => {
      setIsDrawing(false)
      toast.error(e.message)
    },
  })

  const isLoading = drawsLoading || lbLoading || settingsLoading

  if (isLoading) {
    return (
      <div>
        <PanelHeader eyebrow="WC Predict '26" title="Raffle" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!settingsData || !lbData) {
    return (
      <div>
        <PanelHeader eyebrow="WC Predict '26" title="Raffle" />
        <p className="text-muted-foreground">Unable to load game data.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PanelHeader
        eyebrow="WC Predict '26"
        title="Raffle Draw"
        description="Run the end-of-tournament weighted draw. Players earn tickets based on their leaderboard rank."
      />

      {isDrawing ? (
        <DrawAnimation names={lbData.map(l => l.display_name)} />
      ) : winnerResult ? (
        <WinnerView 
          result={winnerResult} 
          onReset={() => setWinnerResult(null)} 
        />
      ) : (
        <PreDrawView 
          leaderboard={lbData} 
          settings={settingsData} 
          onRunDraw={() => {
            setIsDrawing(true)
            runDraw.mutate()
          }} 
        />
      )}

      {drawsData && drawsData.draws.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold mb-4">Past Draws</h3>
          <div className="space-y-3">
            {drawsData.draws.map((d) => {
              const winner = d.entries_snapshot?.entries?.find((e) => e.user_id === d.winner)
              return (
                <div key={d.id} className="rounded-lg border bg-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-yellow-500" />
                      {winner?.display_name || 'Unknown'}
                    </p>
                    <Badge variant="secondary">{d.entries_snapshot?.total_tickets || 0} total tickets in pool</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Drawn {new Date(d.drawn_at).toLocaleString()} · Pick #{d.entries_snapshot?.winning_pick} · {d.entries_snapshot?.entries?.length || 0} players entered
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1 font-mono uppercase">SEED: {d.seed}</p>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

function PreDrawView({ 
  leaderboard, 
  settings, 
  onRunDraw 
}: { 
  leaderboard: LeaderboardEntry[], 
  settings: FifaSettings, 
  onRunDraw: () => void 
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  
  // Calculate eligible entries and tickets based on formula
  const entries = []
  let totalTickets = 0

  for (const lb of leaderboard) {
    if (lb.bets_count < settings.raffle_active_participant_min_bets) continue
    const tickets = Math.max(1, settings.raffle_tickets_base - settings.raffle_tickets_decay * (lb.rank - 1))
    entries.push({ ...lb, tickets })
    totalTickets += tickets
  }

  const isRegistrationOpen = settings.registration_open

  return (
    <section className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-card p-4 rounded-lg border">
        <div>
          <h3 className="font-semibold text-lg">Pre-draw Preview</h3>
          <p className="text-sm text-muted-foreground">
            {entries.length} eligible players · {totalTickets} total tickets in pool
          </p>
        </div>
        
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogTrigger asChild>
            <Button disabled={isRegistrationOpen || entries.length === 0} size="lg">
              <Trophy className="mr-2 h-4 w-4" /> Run Draw
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Execute Raffle Draw?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              This will pick a single winner using a weighted random selection based on the tickets shown below. The snapshot and seed will be permanently recorded for transparency.
            </p>
            <Button onClick={() => {
              setConfirmOpen(false)
              onRunDraw()
            }}>
              Confirm & Draw
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      {isRegistrationOpen && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md border border-destructive/20">
          <AlertCircle className="h-4 w-4" />
          <p>Registration is still open in settings. The draw is disabled until the tournament concludes and betting closes.</p>
        </div>
      )}

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Rank</TableHead>
              <TableHead>Player</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Bets</TableHead>
              <TableHead className="text-right">Tickets</TableHead>
              <TableHead className="text-right">Win Chance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No eligible players (minimum {settings.raffle_active_participant_min_bets} bets required).
                </TableCell>
              </TableRow>
            ) : entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="font-medium">#{entry.rank}</TableCell>
                <TableCell>{entry.display_name}</TableCell>
                <TableCell className="text-right">{entry.balance.toLocaleString()}</TableCell>
                <TableCell className="text-right">{entry.bets_count}</TableCell>
                <TableCell className="text-right font-medium text-primary">{entry.tickets}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {((entry.tickets / totalTickets) * 100).toFixed(1)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

function DrawAnimation({ names }: { names: string[] }) {
  const [currentName, setCurrentName] = useState("...")
  
  useEffect(() => {
    if (names.length === 0) return
    const interval = setInterval(() => {
      const randomName = names[Math.floor(Math.random() * names.length)]
      setCurrentName(randomName || "...")
    }, 50)
    return () => clearInterval(interval)
  }, [names])

  return (
    <div className="flex flex-col items-center justify-center py-24 rounded-lg border bg-card/50">
      <Loader2 className="h-12 w-12 text-primary animate-spin mb-6" />
      <h2 className="text-2xl font-bold tracking-tight mb-2">Drawing Winner...</h2>
      <div className="h-12 flex items-center justify-center">
        <p className="text-4xl font-mono text-muted-foreground animate-pulse">{currentName}</p>
      </div>
    </div>
  )
}

function WinnerView({ result, onReset }: { result: any, onReset: () => void }) {
  const snapshot = result.entries_snapshot
  const winner = result.winner

  return (
    <div className="space-y-6">
      {/* Winner Card */}
      <div className="relative overflow-hidden rounded-xl border-2 border-primary/50 bg-primary/10 p-8 text-center shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5 pointer-events-none" />
        <PartyPopper className="h-12 w-12 text-primary mx-auto mb-4" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-primary mb-2">Raffle Winner</h2>
        <p className="text-4xl font-black mb-4">{winner.display_name}</p>
        <div className="flex justify-center gap-4 text-sm font-medium">
          <Badge variant="outline" className="bg-background/50">Rank #{winner.rank}</Badge>
          <Badge variant="outline" className="bg-background/50">{winner.tickets} tickets ({(winner.tickets / snapshot.total_tickets * 100).toFixed(1)}%)</Badge>
          <Badge variant="outline" className="bg-background/50">{winner.bets_count} bets placed</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={onReset} className="mt-8 relative z-10">
          View all draws
        </Button>
      </div>

      {/* Transparency Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="p-4 border-b bg-muted/30">
          <h3 className="font-semibold flex items-center gap-2">
            <Info className="h-4 w-4" /> Transparency Snapshot
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            The winning pick was #{snapshot.winning_pick} out of {snapshot.total_tickets} total tickets. 
            Selection utilized standard <code>Math.random()</code> weighted distribution at the time of draw.
          </p>
          <p className="text-[10px] font-mono text-muted-foreground mt-2 break-all">SEED: {result.seed}</p>
        </div>
        <div className="max-h-[400px] overflow-auto">
          <Table>
            <TableHeader className="bg-card sticky top-0">
              <TableRow>
                <TableHead className="w-[80px]">Rank</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">Tickets</TableHead>
                <TableHead className="text-right">Win Chance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshot.entries.map((entry: any) => {
                const isWinner = entry.user_id === winner.user_id
                return (
                  <TableRow key={entry.user_id} className={isWinner ? "bg-primary/5 font-medium" : ""}>
                    <TableCell>#{entry.rank}</TableCell>
                    <TableCell className="flex items-center gap-2">
                      {entry.display_name}
                      {isWinner && <Trophy className="h-3 w-3 text-primary" />}
                    </TableCell>
                    <TableCell className="text-right text-primary">{entry.tickets}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {((entry.tickets / snapshot.total_tickets) * 100).toFixed(1)}%
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
