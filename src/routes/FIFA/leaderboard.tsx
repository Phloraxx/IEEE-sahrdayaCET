import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { FifaLayout } from '@/features/fifa/fifa-layout'

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
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="font-display text-3xl text-ieee-blue mb-2">Leaderboard</h1>
        <p className="text-sm text-muted-foreground mb-6">Ranked by current balance. Updates every 15s.</p>

        {isLoading && <p className="text-muted-foreground">Loading…</p>}
        {data?.leaderboard.length === 0 && (
          <p className="text-muted-foreground">No players yet. Be the first!</p>
        )}

        <ol className="space-y-2">
          {data?.leaderboard.map((row) => (
            <li
              key={row.id}
              className={`flex items-center gap-4 rounded-lg border p-3 ${
                row.rank <= 3 ? 'border-ieee-light-blue/40 bg-ieee-light-blue/5' : 'border-border bg-card'
              }`}
            >
              <span className={`font-display text-2xl w-10 text-center ${row.rank === 1 ? 'text-ieee-blue' : 'text-muted-foreground'}`}>
                {row.rank}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{row.display_name}</p>
                <p className="text-xs text-muted-foreground">{row.bets_count} bets</p>
              </div>
              <span className="font-mono text-lg text-ieee-blue">{row.balance.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      </div>
    </FifaLayout>
  )
}
