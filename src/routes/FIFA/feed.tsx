import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FifaLayout } from '@/features/fifa/fifa-layout'
import { usePbSubscription } from '@/hooks/use-pb-subscription'

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

function FeedPage() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['fifa-feed'],
    queryFn: fetchFeed,
    refetchInterval: 30_000,
  })

  // SSE: prepend new events to the React Query cache
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
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="font-display text-3xl text-ieee-blue mb-2">Live Feed</h1>
        <p className="text-sm text-muted-foreground mb-6">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-ieee-success animate-pulse" /> Real-time
          </span>
        </p>

        {isLoading && <p className="text-muted-foreground">Loading…</p>}
        {data?.events.length === 0 && (
          <p className="text-muted-foreground">Nothing happening yet. Place a bet to get the feed going!</p>
        )}

        <div className="space-y-2">
          {data?.events.map((ev) => (
            <FeedItem key={ev.id} event={ev} />
          ))}
        </div>
      </div>
    </FifaLayout>
  )
}

function FeedItem({ event }: { event: FeedEvent }) {
  const icon = event.type === 'bet_placed' ? '⚽' : event.type === 'result' ? '🏁' : event.type === 'raffle' ? '🎁' : '·'
  const time = event.created ? new Date(event.created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <div className="rounded-lg border border-border bg-card p-3 flex items-start gap-3">
      <span className="text-lg flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">{event.message}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{time}</p>
      </div>
    </div>
  )
}
