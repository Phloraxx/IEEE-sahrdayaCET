import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { FifaLayout } from '@/features/fifa/fifa-layout'
import { motion } from 'framer-motion'

interface LeaderboardRow {
  rank: number
  id: string
  display_name: string
  balance: number
  bets_count: number
}

async function fetchLeaderboard(): Promise<{ leaderboard: LeaderboardRow[] }> {
  const res = await fetch('/pb/api/fifa/leaderboard')
  if (!res.ok) throw new Error('Failed to load leaderboard')
  return res.json()
}

export const Route = createFileRoute('/FIFA/leaderboard')({
  head: () => ({ meta: [{ title: "Leaderboard · WC Predict '26" }] }),
  component: LeaderboardPage,
})

function LeaderboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['fifa-leaderboard'],
    queryFn: fetchLeaderboard,
    refetchInterval: 15_000,
  })

  return (
    <FifaLayout active="leaderboard">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="font-display text-3xl text-ieee-light-blue mb-1 uppercase">Leaderboard</h1>
        <p className="text-xs text-muted-foreground mb-3">Ranked by balance (tiebreak: more bets = higher). Updates every 15s.</p>
        <div className="rounded-xl border border-ieee-light-blue/30 bg-ieee-light-blue/5 p-3 mb-5 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground mb-1">Raffle tickets</p>
          <p>Tickets = <code className="text-foreground font-mono">max(1, 50 − 2 × (rank − 1))</code>. Rank 1 → 50 tickets, rank 26+ → 1.</p>
          <p className="mt-1">Need ≥ <strong className="text-foreground">5 bets</strong> to enter. <a href="/FIFA/rules" className="text-ieee-light-blue hover:underline">Full rules →</a></p>
        </div>

        {isLoading && <p className="text-muted-foreground">Loading…</p>}
        {data?.leaderboard.length === 0 && (
          <p className="text-muted-foreground">No players yet. Be the first!</p>
        )}

        <ol className="space-y-1.5">
          {data?.leaderboard.map((row, i) => (
            <motion.li
              key={row.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.5) }}
              className={`flex items-center gap-3 rounded-xl border p-3 ${
                row.rank === 1 ? 'border-ieee-blue/40 bg-ieee-blue/5' : row.rank <= 3 ? 'border-ieee-light-blue/30 bg-ieee-light-blue/5' : 'border-border bg-card'
              }`}
            >
              <span className={`font-display text-xl w-10 text-center ${row.rank === 1 ? 'text-ieee-blue' : row.rank <= 3 ? 'text-ieee-light-blue' : 'text-muted-foreground'}`}>
                {row.rank}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground truncate">{row.display_name}</p>
                <p className="text-[11px] text-muted-foreground">{row.bets_count} bets</p>
              </div>
              <span className="font-mono text-lg text-ieee-blue font-semibold">{row.balance.toLocaleString()}</span>
            </motion.li>
          ))}
        </ol>
      </div>
    </FifaLayout>
  )
}