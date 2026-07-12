import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'

interface DashboardBet {
  id: string
  status: string
}

interface DashboardPayload {
  bets: DashboardBet[]
}

async function fetchDashboard(): Promise<DashboardPayload> {
  const res = await fetch('/api/fifa/dashboard')
  if (!res.ok) throw new Error('Not authenticated')
  return res.json()
}

async function fetchLeaderboardRows() {
  const res = await fetch('/pb/api/fifa/leaderboard')
  if (!res.ok) return []
  const data = await res.json()
  return data.leaderboard ?? []
}

function statusById(bets: DashboardBet[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const b of bets) out[b.id] = b.status
  return out
}

/** Match settled for this user: at least one bet went pending → won/lost. */
function hadMatchSettlement(prev: Record<string, string>, next: DashboardBet[]): boolean {
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
    queryFn: fetchDashboard,
    refetchInterval: 10_000,
    enabled: status === 'authenticated',
  })

  const bets = dashboard?.bets ?? []

  useEffect(() => {
    if (status !== 'authenticated' || !user?.id) {
      prevStatusByIdRef.current = null
      lastUserIdRef.current = null
      return
    }

    if (lastUserIdRef.current !== user.id) {
      lastUserIdRef.current = user.id
      prevStatusByIdRef.current = statusById(bets)
      return
    }

    const prev = prevStatusByIdRef.current
    if (!prev) {
      prevStatusByIdRef.current = statusById(bets)
      return
    }

    const settled = hadMatchSettlement(prev, bets)
    prevStatusByIdRef.current = statusById(bets)

    if (!settled) return

    void (async () => {
      const rows = await fetchLeaderboardRows()
      const me = rows.find((r: { id: string; rank: number }) => r.id === user.id)
      if (me) {
        toast.success(`Results are in — you're rank #${me.rank}`, { id: 'fifa-settle-rank' })
      } else {
        toast.success('Results are in — check your bets on the dashboard', { id: 'fifa-settle-rank' })
      }
    })()
  }, [bets, status, user?.id])

  return null
}