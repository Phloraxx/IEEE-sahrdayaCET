import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usePbSubscription } from '@/hooks/use-pb-subscription'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motion } from 'framer-motion'

interface FeedEvent {
  id: string
  type: string
  message: string
  created: string
}

const FEED_ICONS: Record<string, string> = {
  bet_placed: '⚽',
  result: '🏁',
  raffle: '🎁',
  system: '·',
}

async function fetchFeed(): Promise<{ events: FeedEvent[] }> {
  const res = await fetch('/pb/api/fifa/feed?limit=20')
  if (!res.ok) throw new Error('Failed to load feed')
  return res.json()
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function FeedItem({ ev }: { ev: FeedEvent }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 rounded-xl border border-white/10 bg-[#131519] px-4 py-2.5 text-[13px] whitespace-nowrap text-[#f5f5f5]">
      <span className="text-[15px]">{FEED_ICONS[ev.type] || '·'}</span>
      {ev.message}
      <time className="font-mono text-[11px] text-[#9a9aa2]">
        {ev.created ? timeAgo(ev.created) : ''}
      </time>
    </div>
  )
}

export function FifaFeedMarquee() {
  const reducedMotion = useReducedMotion()
  const queryClient = useQueryClient()
  const [isPaused, setIsPaused] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['fifa-feed'],
    queryFn: fetchFeed,
    refetchInterval: 30_000,
  })

  usePbSubscription('fifa_feed_events', '*', (e) => {
    if (e.action === 'create') {
      setIsPaused(true)
      setTimeout(() => setIsPaused(false), 300)

      queryClient.setQueryData<{ events: FeedEvent[] } | undefined>(['fifa-feed'], (old) => {
        if (!old) return old
        const rec = e.record as Record<string, unknown>
        const newEvent: FeedEvent = {
          id: String(rec.id || ''),
          type: String(rec.type || ''),
          message: String(rec.message || ''),
          created: String(rec.created || ''),
        }
        return { events: [newEvent, ...old.events].slice(0, 20) }
      })
    }
  })

  const events = data?.events ?? []

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden bg-[#131519] py-12"
    >
      <div className="mx-auto mb-4 flex max-w-[1100px] flex-wrap items-center justify-between gap-2.5 px-[clamp(20px,4vw,48px)]">
        <h2 className="font-display text-[clamp(22px,3vw,30px)] text-ieee-light-blue uppercase">
          Live Feed
        </h2>
        <div className="flex items-center gap-2 text-xs font-semibold text-[#9a9aa2]">
          <span className="live-dot" />
          Real-time
          <Link to="/FIFA/feed/" className="ml-2 text-ieee-light-blue hover:underline">
            View all →
          </Link>
        </div>
      </div>

      {isLoading && (
        <p className="px-[clamp(20px,4vw,48px)] text-sm text-[#9a9aa2]">Loading feed…</p>
      )}
      {!isLoading && events.length === 0 && (
        <p className="px-[clamp(20px,4vw,48px)] text-sm text-[#9a9aa2]">
          Nothing happening yet. Place a bet to get the feed going!
        </p>
      )}

      {events.length > 0 && (
        <div
          className={`overflow-hidden ${reducedMotion ? '' : 'group'}`}
          style={
            reducedMotion
              ? undefined
              : {
                  WebkitMaskImage:
                    'linear-gradient(90deg, transparent 0%, #131519 6%, #131519 94%, transparent 100%)',
                  maskImage:
                    'linear-gradient(90deg, transparent 0%, #131519 6%, #131519 94%, transparent 100%)',
                }
          }
        >
          {reducedMotion ? (
            <div className="flex flex-wrap gap-3 px-[clamp(20px,4vw,48px)]">
              {events.slice(0, 6).map((ev) => (
                <FeedItem key={ev.id} ev={ev} />
              ))}
            </div>
          ) : (
            <div 
              className="fifa-marquee-track flex w-max gap-3 group-hover:[animation-play-state:paused]"
              style={isPaused ? { animationPlayState: 'paused' } : undefined}
            >
              {events.map((ev) => (
                <FeedItem key={ev.id} ev={ev} />
              ))}
              {events.map((ev) => (
                <FeedItem key={`${ev.id}-clone`} ev={ev} />
              ))}
            </div>
          )}
        </div>
      )}
    </motion.section>
  )
}