'use client'

import { useEffect, useRef } from 'react'
import { getPbClient } from '@/lib/pb-client'

// SSE hook for public collections. Subscribes on mount, unsubscribes on unmount.
// Only for public collections (fifa_feed_events, fifa_bet_markets, fifa_matches)
// — authed data is polled via React Query against /api/fifa/* server functions.
//
// Usage:
//   usePbSubscription('fifa_feed_events', '*', (e) => { ... })
export function usePbSubscription(
  collection: string,
  recordId: string,
  onChange: (event: { action: string; record: Record<string, unknown> }) => void,
) {
  const cbRef = useRef(onChange)
  cbRef.current = onChange

  useEffect(() => {
    let unsubPromise: Promise<() => void> | undefined
    let unsub: (() => void) | undefined

    const subscribe = async () => {
      try {
        const pb = getPbClient()
        unsubPromise = pb.collection(collection).subscribe(recordId, (e) => {
          cbRef.current({ action: e.action, record: e.record as Record<string, unknown> })
        })
        unsub = await unsubPromise
      } catch {
        // SSE not available (e.g. dev without PB running) — silently fall back
        // to polling. The page's React Query will keep refreshing.
      }
    }
    subscribe()

    return () => {
      if (unsub) {
        try { unsub() } catch { /* already unsubscribed */ }
      }
    }
  }, [collection, recordId])
}
