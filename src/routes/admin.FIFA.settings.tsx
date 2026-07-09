import { createFileRoute } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, AlertCircle } from "lucide-react"
import { PanelHeader } from "@/components/admin/panel-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { FifaSettingsSchema } from "@/schemas/fifa"
import { useEffect } from "react"

export const Route = createFileRoute("/admin/FIFA/settings")({
  component: AdminFifaSettings,
})

type SettingsFormValues = z.infer<typeof FifaSettingsSchema>

async function fetchSettings() {
  const res = await fetch('/api/admin/fifa/settings')
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to load settings')
  }
  const data = await res.json()
  return data.settings
}

async function fetchDraws() {
  const res = await fetch('/api/admin/fifa/raffle-draws')
  if (!res.ok) throw new Error('Failed to load draws')
  return res.json()
}

function AdminFifaSettings() {
  const queryClient = useQueryClient()
  
  const { data: settingsData, isLoading: settingsLoading } = useQuery({ 
    queryKey: ['admin-fifa-settings'], 
    queryFn: fetchSettings 
  })
  
  const { data: drawsData, isLoading: drawsLoading } = useQuery({ 
    queryKey: ['admin-fifa-raffle-draws'], 
    queryFn: fetchDraws 
  })

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(FifaSettingsSchema) as any,
    defaultValues: {
      event_name: "IEEE Sahrdaya WC Predict '26",
      starting_balance: 1000,
      max_bet_percent: 25,
      daily_topup_threshold: 100,
      daily_topup_target: 200,
      pool_house_cut_percent: 0,
      raffle_tickets_base: 50,
      raffle_tickets_decay: 2,
      raffle_active_participant_min_bets: 5,
      auto_void_hours: 6,
      prize: "",
      registration_open: true,
    }
  })

  useEffect(() => {
    if (settingsData) {
      form.reset(settingsData)
    }
  }, [settingsData, form])

  const save = useMutation({
    mutationFn: async (values: SettingsFormValues) => {
      const res = await fetch('/api/admin/fifa/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || err.error || 'Failed to save settings')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Settings saved successfully')
      queryClient.invalidateQueries({ queryKey: ['admin-fifa-settings'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (settingsLoading || drawsLoading) return <Skeleton className="h-64 w-full" />

  const target = form.watch("daily_topup_target")
  const threshold = form.watch("daily_topup_threshold")
  const topupWarning = target < threshold

  const regOpen = form.watch("registration_open")
  const hasDraws = drawsData && drawsData.draws && drawsData.draws.length > 0
  const raffleWarning = regOpen && hasDraws

  const onSubmit = (values: SettingsFormValues) => {
    if (values.daily_topup_target < values.daily_topup_threshold) {
      toast.error("Top-up target must be greater than or equal to threshold")
      return
    }
    save.mutate(values)
  }

  return (
    <div>
      <PanelHeader eyebrow="WC Predict '26" title="Settings" description="Game economy, top-up, and raffle configuration." />
      
      <div className="max-w-xl space-y-6">
        {raffleWarning && (
          <div className="flex items-start gap-3 text-sm text-amber-600 bg-amber-50 p-4 rounded-md border border-amber-200">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p><strong>Warning:</strong> A raffle has already been drawn but registration is still open. You generally want to close registration before or immediately after drawing the final prize.</p>
          </div>
        )}

        {topupWarning && (
          <div className="flex items-start gap-3 text-sm text-destructive bg-destructive/10 p-4 rounded-md border border-destructive/20">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p><strong>Invalid Configuration:</strong> Top-up target must be greater than or equal to threshold. Saving is currently blocked.</p>
          </div>
        )}

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="event_name">Event name</Label>
              <Input id="event_name" {...form.register("event_name")} />
              <p className="text-xs text-muted-foreground mt-1">The public name shown on the homepage and leaderboard</p>
              {form.formState.errors.event_name && <p className="text-xs text-destructive mt-1">{form.formState.errors.event_name.message}</p>}
            </div>
            
            <div>
              <Label htmlFor="prize">Prize</Label>
              <Input id="prize" {...form.register("prize")} placeholder="Sponsor voucher" />
              <p className="text-xs text-muted-foreground mt-1">Free text description of the prize (shown publicly)</p>
              {form.formState.errors.prize && <p className="text-xs text-destructive mt-1">{form.formState.errors.prize.message}</p>}
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <h3 className="text-sm font-semibold mb-4">Economy</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="starting_balance">Starting balance</Label>
                <Input id="starting_balance" type="number" {...form.register("starting_balance", { valueAsNumber: true })} />
                <p className="text-xs text-muted-foreground mt-1">Points granted to every student on first login</p>
                {form.formState.errors.starting_balance && <p className="text-xs text-destructive mt-1">{form.formState.errors.starting_balance.message}</p>}
              </div>
              <div>
                <Label htmlFor="max_bet_percent">Max bet %</Label>
                <Input id="max_bet_percent" type="number" min={1} max={100} {...form.register("max_bet_percent", { valueAsNumber: true })} />
                <p className="text-xs text-muted-foreground mt-1">Maximum % of a user's current balance they can stake in a single bet (1–100)</p>
                {form.formState.errors.max_bet_percent && <p className="text-xs text-destructive mt-1">{form.formState.errors.max_bet_percent.message}</p>}
              </div>
              <div>
                <Label htmlFor="pool_house_cut_percent">Pool house cut %</Label>
                <Input id="pool_house_cut_percent" type="number" min={0} max={100} {...form.register("pool_house_cut_percent", { valueAsNumber: true })} />
                <p className="text-xs text-muted-foreground mt-1">% of pool taken before distributing to winners. 0 = no cut</p>
                {form.formState.errors.pool_house_cut_percent && <p className="text-xs text-destructive mt-1">{form.formState.errors.pool_house_cut_percent.message}</p>}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <h3 className="text-sm font-semibold mb-4">Daily top-up</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="daily_topup_threshold">Threshold</Label>
                <Input id="daily_topup_threshold" type="number" {...form.register("daily_topup_threshold", { valueAsNumber: true })} />
                <p className="text-xs text-muted-foreground mt-1">Users below this balance get topped up daily at 09:00 server time</p>
                {form.formState.errors.daily_topup_threshold && <p className="text-xs text-destructive mt-1">{form.formState.errors.daily_topup_threshold.message}</p>}
              </div>
              <div>
                <Label htmlFor="daily_topup_target">Target</Label>
                <Input id="daily_topup_target" type="number" {...form.register("daily_topup_target", { valueAsNumber: true })} />
                <p className="text-xs text-muted-foreground mt-1">What their balance gets topped up to (must be &ge; threshold)</p>
                {form.formState.errors.daily_topup_target && <p className="text-xs text-destructive mt-1">{form.formState.errors.daily_topup_target.message}</p>}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <h3 className="text-sm font-semibold mb-4">Raffle</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="raffle_tickets_base">Tickets base</Label>
                <Input id="raffle_tickets_base" type="number" {...form.register("raffle_tickets_base", { valueAsNumber: true })} />
                <p className="text-xs text-muted-foreground mt-1">Ticket count for rank 1. Formula: max(1, base - decay &times; (rank-1))</p>
                {form.formState.errors.raffle_tickets_base && <p className="text-xs text-destructive mt-1">{form.formState.errors.raffle_tickets_base.message}</p>}
              </div>
              <div>
                <Label htmlFor="raffle_tickets_decay">Decay per rank</Label>
                <Input id="raffle_tickets_decay" type="number" {...form.register("raffle_tickets_decay", { valueAsNumber: true })} />
                <p className="text-xs text-muted-foreground mt-1">How fast tickets drop off per rank</p>
                {form.formState.errors.raffle_tickets_decay && <p className="text-xs text-destructive mt-1">{form.formState.errors.raffle_tickets_decay.message}</p>}
              </div>
              <div>
                <Label htmlFor="raffle_active_participant_min_bets">Min bets to enter</Label>
                <Input id="raffle_active_participant_min_bets" type="number" min={0} {...form.register("raffle_active_participant_min_bets", { valueAsNumber: true })} />
                <p className="text-xs text-muted-foreground mt-1">Minimum bets a user must have placed to enter the raffle</p>
                {form.formState.errors.raffle_active_participant_min_bets && <p className="text-xs text-destructive mt-1">{form.formState.errors.raffle_active_participant_min_bets.message}</p>}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <h3 className="text-sm font-semibold mb-4">System</h3>
            <div className="space-y-4">
              <div>
                <Label htmlFor="auto_void_hours">Auto-void after (hours)</Label>
                <Input id="auto_void_hours" type="number" min={1} {...form.register("auto_void_hours", { valueAsNumber: true })} />
                <p className="text-xs text-muted-foreground mt-1">Hours after kickoff before unsettled markets are auto-voided</p>
                {form.formState.errors.auto_void_hours && <p className="text-xs text-destructive mt-1">{form.formState.errors.auto_void_hours.message}</p>}
              </div>

              <label className="flex items-center gap-2 p-3 border rounded-md cursor-pointer hover:bg-muted/50 transition-colors">
                <input type="checkbox" {...form.register("registration_open")} className="h-4 w-4" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Registration open</span>
                  <span className="text-xs text-muted-foreground">When off, no new students can join or place bets</span>
                </div>
              </label>
            </div>
          </div>

          <Button type="submit" disabled={save.isPending || topupWarning} className="w-full">
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save settings
          </Button>
        </form>
      </div>
    </div>
  )
}
