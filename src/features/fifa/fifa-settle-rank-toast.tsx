import { useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { fetchFifaDashboard } from '@/lib/fifa-dashboard-client'
import { fetchFifaLeaderboard } from '@/lib/fifa-leaderboard'

function statusById(bets: Array<{ id: string; status: string }>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const b of bets) out[b.id] = b.status
  return out
}

/** Match settled for this user: at least one bet went pending → won/lost. */
function hadMatchSettlement(
  prev: Record<string, string>,
  next: Array<{ id: string; status: string }>,
): boolean {
  for (const b of next) {
    const was = prev[b.id]
    if (was === 'pending' && (b.status === 'won' || b.status === 'lost')) {
      return true
    }
  }
  return false
}

/**
 * When a match settles, pending bets flip to won/lost — toast the user's new rank.
 */
export function FifaSettleRankToast() {
  const { status, user } = useAuth()
  const prevStatusByIdRef = useRef<Record<string, string> | null>(null)
  const lastUserIdRef = useRef<string | null>(null)

  const { data: dashboard } = useQuery({
    queryKey: ['fifa-dashboard'],
    queryFn: () => fetchFifaDashboard(),
    refetchInterval: 10_000,
    enabled: typeof window !== 'undefined' && status === 'authenticated',
  })

  const betStatuses = useMemo(() => dashboard?.bet_statuses ?? [], [dashboard?.bet_statuses])

  useEffect(() => {
    if (status !== 'authenticated' || !user?.id) {
      prevStatusByIdRef.current = null
      lastUserIdRef.current = null
      return
    }

    if (lastUserIdRef.current !== user.id) {
      lastUserIdRef.current = user.id
      prevStatusByIdRef.current = statusById(betStatuses)
      return
    }

    const prev = prevStatusByIdRef.current
    if (!prev) {
      prevStatusByIdRef.current = statusById(betStatuses)
      return
    }

    const settled = hadMatchSettlement(prev, betStatuses)
    prevStatusByIdRef.current = statusById(betStatuses)

    if (!settled) return

    void (async () => {
      const { leaderboard } = await fetchFifaLeaderboard().catch(() => ({ leaderboard: [] }))
      const me = leaderboard.find((row) => row.id === user.id)
      if (me) {
        toast.success(`Results are in — you're rank #${me.rank}`, { id: 'fifa-settle-rank' })
      } else {
        toast.success('Results are in — check your bets on the dashboard', { id: 'fifa-settle-rank' })
      }
    })()
  }, [betStatuses, status, user?.id])

  return null
}