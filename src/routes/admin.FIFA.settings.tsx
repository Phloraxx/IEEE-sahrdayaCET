import { createFileRoute } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { PanelHeader } from "@/components/admin/panel-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"

export const Route = createFileRoute("/admin/FIFA/settings")({
  component: AdminFifaSettings,
})

interface Settings {
  id: string
  event_name: string
  starting_balance: number
  max_bet_percent: number
  daily_topup_threshold: number
  daily_topup_target: number
  pool_house_cut_percent: number
  raffle_tickets_base: number
  raffle_tickets_decay: number
  raffle_active_participant_min_bets: number
  auto_void_hours: number
  prize: string
  registration_open: boolean
}

async function fetchSettings(): Promise<Settings> {
  const res = await fetch('/api/admin/fifa/settings')
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to load settings')
  }
  const data = await res.json()
  return data.settings
}

function AdminFifaSettings() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['admin-fifa-settings'], queryFn: fetchSettings })
  const [form, setForm] = useState<Settings | null>(null)

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return
      const res = await fetch('/api/admin/fifa/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_name: form.event_name,
          starting_balance: Number(form.starting_balance),
          max_bet_percent: Number(form.max_bet_percent),
          daily_topup_threshold: Number(form.daily_topup_threshold),
          daily_topup_target: Number(form.daily_topup_target),
          pool_house_cut_percent: Number(form.pool_house_cut_percent),
          raffle_tickets_base: Number(form.raffle_tickets_base),
          raffle_tickets_decay: Number(form.raffle_tickets_decay),
          raffle_active_participant_min_bets: Number(form.raffle_active_participant_min_bets),
          auto_void_hours: Number(form.auto_void_hours),
          prize: form.prize,
          registration_open: form.registration_open,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Failed to save settings')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Settings saved')
      queryClient.invalidateQueries({ queryKey: ['admin-fifa-settings'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!form) return <p className="text-muted-foreground">Settings not found.</p>

  return (
    <div>
      <PanelHeader eyebrow="WC Predict '26" title="Settings" description="Game economy, top-up, and raffle configuration." />
      <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="max-w-xl space-y-4">
        <div>
          <Label htmlFor="event_name">Event name</Label>
          <Input id="event_name" value={form.event_name} onChange={(e) => setForm({ ...form, event_name: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="prize">Prize (free text)</Label>
          <Input id="prize" value={form.prize} onChange={(e) => setForm({ ...form, prize: e.target.value })} placeholder="Sponsor voucher" />
        </div>

        <h3 className="text-sm font-semibold pt-2">Economy</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="starting_balance">Starting balance</Label>
            <Input id="starting_balance" type="number" value={form.starting_balance} onChange={(e) => setForm({ ...form, starting_balance: Number(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="max_bet_percent">Max bet %</Label>
            <Input id="max_bet_percent" type="number" min={1} max={100} value={form.max_bet_percent} onChange={(e) => setForm({ ...form, max_bet_percent: Number(e.target.value) })} />
          </div>
        </div>

        <h3 className="text-sm font-semibold pt-2">Daily top-up</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="daily_topup_threshold">Threshold</Label>
            <Input id="daily_topup_threshold" type="number" value={form.daily_topup_threshold} onChange={(e) => setForm({ ...form, daily_topup_threshold: Number(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="daily_topup_target">Target</Label>
            <Input id="daily_topup_target" type="number" value={form.daily_topup_target} onChange={(e) => setForm({ ...form, daily_topup_target: Number(e.target.value) })} />
          </div>
        </div>

        <div>
          <Label htmlFor="pool_house_cut_percent">Pool house cut %</Label>
          <Input id="pool_house_cut_percent" type="number" min={0} max={100} value={form.pool_house_cut_percent} onChange={(e) => setForm({ ...form, pool_house_cut_percent: Number(e.target.value) })} />
        </div>

        <h3 className="text-sm font-semibold pt-2">Raffle</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="raffle_tickets_base">Tickets base</Label>
            <Input id="raffle_tickets_base" type="number" value={form.raffle_tickets_base} onChange={(e) => setForm({ ...form, raffle_tickets_base: Number(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="raffle_tickets_decay">Decay per rank</Label>
            <Input id="raffle_tickets_decay" type="number" value={form.raffle_tickets_decay} onChange={(e) => setForm({ ...form, raffle_tickets_decay: Number(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="raffle_active_participant_min_bets">Min bets to enter</Label>
            <Input id="raffle_active_participant_min_bets" type="number" min={1} value={form.raffle_active_participant_min_bets} onChange={(e) => setForm({ ...form, raffle_active_participant_min_bets: Number(e.target.value) })} />
          </div>
        </div>

        <h3 className="text-sm font-semibold pt-2">Auto-void</h3>
        <div>
          <Label htmlFor="auto_void_hours">Auto-void after (hours)</Label>
          <Input id="auto_void_hours" type="number" min={1} value={form.auto_void_hours} onChange={(e) => setForm({ ...form, auto_void_hours: Number(e.target.value) })} />
          <p className="text-xs text-muted-foreground mt-1">Matches not settled this long after kickoff are auto-voided (cron runs every 30 min). Finished-but-unsettled matches void after 48h regardless.</p>
        </div>

        <label className="flex items-center gap-2 pt-2">
          <input type="checkbox" checked={form.registration_open} onChange={(e) => setForm({ ...form, registration_open: e.target.checked })} />
          <span className="text-sm">Registration open</span>
        </label>

        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save settings
        </Button>
      </form>
    </div>
  )
}
