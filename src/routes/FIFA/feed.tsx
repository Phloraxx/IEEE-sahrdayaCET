import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FifaLayout } from '@/features/fifa/fifa-layout'
import { usePbSubscription } from '@/hooks/use-pb-subscription'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, Flag, Gift, Target, Clock } from 'lucide-react'

interface FeedEvent {
  id: string
  type: string
  user: string
  match: string
  message: string
  created: string
}

async function fetchFeed(): Promise<{ events: FeedEvent[] }> {
  const res = await fetch('/pb/api/fifa/feed?limit=50')
  if (!res.ok) throw new Error('Failed to load feed')
  return res.json()
}

export const Route = createFileRoute('/FIFA/feed')({
  head: () => ({ meta: [{ title: "Live Feed · WC Predict '26" }] }),
  component: FeedPage,
})

function getEventIcon(type: string) {
  switch (type) {
    case 'bet_placed':
      return <Target className="w-5 h-5 text-ieee-light-blue" />
    case 'result':
      return <Flag className="w-5 h-5 text-ieee-success" />
    case 'raffle':
      return <Gift className="w-5 h-5 text-amber-500" />
    default:
      return <Activity className="w-5 h-5 text-muted-foreground" />
  }
}

function getEventBg(type: string) {
  switch (type) {
    case 'bet_placed':
      return 'bg-ieee-light-blue/10 border-ieee-light-blue/20'
    case 'result':
      return 'bg-ieee-success/10 border-ieee-success/20'
    case 'raffle':
      return 'bg-amber-500/10 border-amber-500/20'
    default:
      return 'bg-muted/10 border-border'
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function FeedPage() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['fifa-feed'],
    queryFn: fetchFeed,
    refetchInterval: 30_000,
  })

  usePbSubscription('fifa_feed_events', '*', (e) => {
    if (e.action === 'create') {
      queryClient.setQueryData<{ events: FeedEvent[] } | undefined>(['fifa-feed'], (old) => {
        if (!old) return old
        const newEvent: FeedEvent = {
          id: String((e.record as Record<string, unknown>).id || ''),
          type: String((e.record as Record<string, unknown>).type || ''),
          user: String((e.record as Record<string, unknown>).user || ''),
          match: String((e.record as Record<string, unknown>).match || ''),
          message: String((e.record as Record<string, unknown>).message || ''),
          created: String((e.record as Record<string, unknown>).created || ''),
        }
        return { events: [newEvent, ...old.events].slice(0, 50) }
      })
    }
  })

  return (
    <FifaLayout active="feed">
      <div className="w-full flex-1 flex flex-col bg-[#0a0a0b]">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8 py-4 md:py-6">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 border-b border-border pb-6">
            <div>
              <h1 className="font-display text-3xl sm:text-4xl text-ieee-light-blue uppercase tracking-tight mb-2">
                Live Feed
              </h1>
              <p className="text-sm text-muted-foreground">
                The pulse of the tournament. Watch bets, results, and raffle winners roll in.
              </p>
            </div>
            
            <div className="shrink-0 inline-flex items-center gap-2 rounded-full border border-ieee-success/30 bg-ieee-success/10 px-4 py-1.5 text-xs font-semibold text-ieee-success uppercase tracking-wider">
              <motion.span
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="h-2 w-2 rounded-full bg-ieee-success shadow-[0_0_8px_rgba(34,197,94,0.6)]"
              />
              Real-time
            </div>
          </div>

          {isLoading && (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-20 w-full animate-pulse rounded-xl bg-card border border-border" />
              ))}
            </div>
          )}

          {!isLoading && data?.events.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed border-border bg-card/50">
              <Activity className="w-12 h-12 text-muted-foreground opacity-50 mb-4" />
              <h3 className="font-display text-xl uppercase mb-2">It's Quiet Here</h3>
              <p className="text-muted-foreground text-sm max-w-sm mb-6">Nothing happening yet. Be the first to place a bet and get the feed going!</p>
              <Link to="/FIFA/matches" className="px-6 py-2.5 rounded-lg bg-ieee-blue text-white text-sm font-semibold hover:bg-ieee-light-blue transition-colors">
                View Matches
              </Link>
            </div>
          )}

          <div className="relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-border before:via-border/50 before:to-transparent">
            <AnimatePresence initial={false}>
              {data?.events.map((ev, i) => (
                <motion.div
                  key={ev.id}
                  initial={{ opacity: 0, y: -20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: i * 0.05 }}
                  className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group py-4"
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-[#0a0a0b] bg-card shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10">
                    {getEventIcon(ev.type)}
                  </div>
                  
                  <div className={`w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md ${getEventBg(ev.type)}`}>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          {ev.type.replace('_', ' ')}
                        </span>
                        <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {ev.created ? timeAgo(ev.created) : ''}
                        </div>
                      </div>
                      <p className="text-sm text-foreground leading-snug">
                        {ev.message}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

        </div>
      </div>
    </FifaLayout>
  )
}