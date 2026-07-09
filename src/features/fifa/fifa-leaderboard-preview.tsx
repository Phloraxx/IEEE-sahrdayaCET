import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
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

function RowSkeleton() {
  return <div className="h-[52px] animate-pulse rounded-xl bg-[#131519]" />
}

export function FifaLeaderboardPreview() {
  const { data, isLoading } = useQuery({
    queryKey: ['fifa-leaderboard'],
    queryFn: fetchLeaderboard,
    refetchInterval: 15_000,
  })

  const top = data?.leaderboard.slice(0, 5) ?? []

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto max-w-[1100px] px-[clamp(20px,4vw,48px)] py-16"
    >
      <div className="mb-8">
        <h2 className="font-display text-[clamp(26px,3.4vw,38px)] text-ieee-light-blue uppercase">
          Leaderboard
        </h2>
        <p className="mt-2 max-w-[560px] text-sm text-[#9a9aa2]">
          Ranked by balance (tiebreak: more bets = higher). Updates every 15s.
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-1.5">
          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} />)}
          {!isLoading && top.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-[#9a9aa2]">
              No players yet. Be the first!
            </p>
          )}
          {top.map((row) => (
            <div
              key={row.id}
              className={`flex items-center gap-3.5 rounded-xl border p-3 ${
                row.rank === 1
                  ? 'border-ieee-blue/40 bg-ieee-blue/5'
                  : row.rank <= 3
                    ? 'border-ieee-light-blue/35 bg-ieee-light-blue/5'
                    : 'border-white/10 bg-[#131519]'
              }`}
            >
              <span
                className={`font-display w-8 text-center text-[19px] ${
                  row.rank <= 3 ? 'text-ieee-light-blue' : 'text-[#9a9aa2]'
                }`}
              >
                {row.rank}
              </span>
              <div className="min-w-0 flex-1">
                <b className="block truncate text-[13.5px] font-bold">{row.display_name}</b>
                <span className="text-[11px] text-[#9a9aa2]">{row.bets_count} bets</span>
              </div>
              <span className="font-mono text-[15px] font-bold text-ieee-light-blue tabular-nums">
                {row.balance.toLocaleString()}
              </span>
            </div>
          ))}
        </div>

        <div className="rounded-[14px] border border-ieee-light-blue/30 bg-gradient-to-br from-ieee-light-blue/10 to-transparent p-[18px] text-[12.5px] text-[#9a9aa2]">
          <p className="mb-2 text-[13.5px] font-bold text-[#f5f5f5]">Raffle tickets</p>
          <p>
            Tickets ={' '}
            <code className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[#f5f5f5]">
              max(1, 50 − 2 × (rank − 1))
            </code>
            . Rank 1 → 50 tickets, rank 26+ → 1.
          </p>
          <p className="mt-2">
            Need ≥ <strong className="text-[#f5f5f5]">5 bets</strong> to enter the raffle.
          </p>
          <Link
            to="/FIFA/rules/"
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-ieee-light-blue hover:underline"
          >
            Full rules →
          </Link>
        </div>
      </div>

      <Link
        to="/FIFA/leaderboard/"
        className="mt-3.5 inline-flex items-center gap-1.5 text-[13px] font-bold text-ieee-light-blue hover:underline"
      >
        View full leaderboard →
      </Link>
    </motion.section>
  )
}