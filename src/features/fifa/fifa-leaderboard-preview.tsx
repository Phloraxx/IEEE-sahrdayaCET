import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'

interface LeaderboardRow {
  rank: number
  id: string
  display_name: string
  balance: number
  bets_count: number
}

async function fetchLeaderboard(): Promise<{
  leaderboard: LeaderboardRow[]
  settings?: { min_bets: number }
}> {
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
  const minBets = data?.settings?.min_bets ?? 5

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
          Ranked by tickets (tiebreak: more bets = higher). Updates every 15s.
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
              className={`flex items-center gap-3.5 rounded-xl border p-3 transition-colors ${
                row.rank === 1
                  ? 'border-yellow-500/40 bg-yellow-500/5 hover:bg-yellow-500/10'
                  : row.rank === 2
                    ? 'border-slate-400/40 bg-slate-400/5 hover:bg-slate-400/10'
                    : row.rank === 3
                      ? 'border-orange-500/40 bg-orange-500/5 hover:bg-orange-500/10'
                      : 'border-white/10 bg-[#131519] hover:bg-white/5'
              }`}
            >
              <span
                className={`font-display w-8 text-center text-[19px] ${
                  row.rank === 1 ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]' :
                  row.rank === 2 ? 'text-slate-300' :
                  row.rank === 3 ? 'text-orange-500' :
                  'text-[#9a9aa2]'
                }`}
              >
                {row.rank}
              </span>
              <div className="min-w-0 flex-1">
                <b className="block truncate text-[13.5px] font-bold text-white">{row.display_name}</b>
                <span className="text-[11px] text-[#9a9aa2]">{row.bets_count} bets</span>
              </div>
              <span className={`font-mono text-[15px] font-bold tabular-nums ${
                row.rank === 1 ? 'text-yellow-400' : 'text-ieee-light-blue'
              }`}>
                {row.balance.toLocaleString()}
              </span>
            </div>
          ))}
        </div>

        <div className="rounded-[14px] border border-ieee-light-blue/30 bg-gradient-to-br from-ieee-light-blue/10 to-transparent p-[18px] text-[12.5px] text-[#9a9aa2]">
          <p className="mb-2 text-[13.5px] font-bold text-[#f5f5f5]">Prize draw</p>
          <p>Climb the leaderboard with more tickets. Need ≥ <strong className="text-[#f5f5f5]">{minBets} bets</strong> to enter the draw.</p>
          <p className="mt-2 text-[12px]">#1 does not automatically win the voucher.</p>
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