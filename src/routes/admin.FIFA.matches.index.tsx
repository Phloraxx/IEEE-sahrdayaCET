import {
  createFileRoute,
  Link,
} from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Pencil, Plus, Trophy } from "lucide-react";
import { PanelHeader } from "@/components/admin/panel-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/FIFA/matches/")({
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
});

interface MatchRow {
  id: string
  team_home: string
  team_away: string
  stage: string
  kickoff_at: string
  betting_locks_at: string
  status: string
  settled: boolean
}

async function fetchMatches(): Promise<{ matches: MatchRow[] }> {
  const res = await fetch('/api/admin/fifa/matches?perPage=100')
  if (!res.ok) throw new Error('Failed to load matches')
  return res.json()
}

function AdminFifaMatches() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-fifa-matches'], queryFn: fetchMatches })
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div>
      <PanelHeader
        eyebrow="WC Predict '26"
        title="Matches"
        description="Create matches, then manage markets and settlement from each match page."
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> New match</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create match</DialogTitle>
              </DialogHeader>
              <CreateMatchForm onDone={() => setCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading && <Skeleton className="h-32 w-full" />}
      {data && data.matches.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Trophy className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No matches yet. Create the first one to open betting.</p>
        </div>
      )}

      <div className="space-y-2">
        {data?.matches.map((m) => (
          <Link
            key={m.id}
            to="/admin/FIFA/matches/$id"
            params={{ id: m.id }}
            className="flex items-center justify-between rounded-lg border bg-card p-4 hover:border-primary/50 transition-colors"
          >
            <div className="min-w-0">
              <p className="font-medium truncate">{m.team_home} vs {m.team_away}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {m.stage.toUpperCase()} · {new Date(m.kickoff_at).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={m.status} settled={m.settled} />
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </div>
          </Link>
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

function CreateMatchForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient()
  const initialForm = {
    team_home: '', team_away: '', stage: 'qf', kickoff_at: '', betting_locks_at: '',
  }
  const [form, setForm] = useState(initialForm)

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/fifa/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          status: 'upcoming',
          betting_locks_at: form.betting_locks_at || form.kickoff_at,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create match')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Match created')
      queryClient.invalidateQueries({ queryKey: ['admin-fifa-matches'] })
      setForm(initialForm)
      onDone()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <form onSubmit={(e) => { e.preventDefault(); create.mutate() }} className="space-y-3 pt-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="team_home">Home team</Label>
          <Input id="team_home" value={form.team_home} onChange={(e) => setForm({ ...form, team_home: e.target.value })} required />
        </div>
        <div>
          <Label htmlFor="team_away">Away team</Label>
          <Input id="team_away" value={form.team_away} onChange={(e) => setForm({ ...form, team_away: e.target.value })} required />
        </div>
      </div>
      <div>
        <Label htmlFor="stage">Stage</Label>
        <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="qf">Quarterfinal</SelectItem>
            <SelectItem value="sf">Semifinal</SelectItem>
            <SelectItem value="third_place">Third place</SelectItem>
            <SelectItem value="final">Final</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="kickoff_at">Kickoff time</Label>
        <Input id="kickoff_at" type="datetime-local" value={form.kickoff_at} onChange={(e) => setForm({ ...form, kickoff_at: e.target.value })} required />
      </div>
      <div>
        <Label htmlFor="betting_locks_at">Betting locks at (optional, defaults to kickoff)</Label>
        <Input id="betting_locks_at" type="datetime-local" value={form.betting_locks_at} onChange={(e) => setForm({ ...form, betting_locks_at: e.target.value })} />
      </div>
      <Button type="submit" disabled={create.isPending} className="w-full">
        {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create match
      </Button>
    </form>
  )
}
