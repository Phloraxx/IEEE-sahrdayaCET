import { useEffect, useRef, useState } from 'react'
import { getPbClient } from '@/lib/pb-client'

// SSE hook for collections whose PocketBase rules allow the current client to subscribe.
// Authenticated data continues to flow through the PocketBase client and React Query.
export function usePbSubscription(
  collection: string,
  recordId: string,
  onChange: (event: { action: string; record: Record<string, unknown> }) => void,
) {
  const [isConnected, setIsConnected] = useState(true)
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
        // SSE not available (e.g. dev without PB running)
        setIsConnected(false)
      }
    }
    subscribe()

    // PB SDK doesn't emit explicit connect/disconnect events for realtime,
    // so we poll the internal flag to expose status to the UI.
    const interval = setInterval(() => {
      try {
        const pb = getPbClient()
        setIsConnected(pb.realtime.isConnected)
      } catch {
        setIsConnected(false)
      }
    }, 2000)

    return () => {
      clearInterval(interval)
      if (unsub) {
        try { unsub() } catch { /* already unsubscribed */ }
      }
    }
  }, [collection, recordId])

  return { isConnected }
}
