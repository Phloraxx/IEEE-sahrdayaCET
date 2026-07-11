import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { FifaLayout } from '@/features/fifa/fifa-layout'
import { motion } from 'framer-motion'
import { Trophy, Medal, ArrowUp, Info } from 'lucide-react'

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

function PodiumStep({ player, rank, delay }: { player?: LeaderboardRow; rank: 1 | 2 | 3; delay: number }) {
  if (!player) return <div className="w-24 sm:w-32" />

  const isFirst = rank === 1
  const height = rank === 1 ? 'h-36 sm:h-44' : rank === 2 ? 'h-28 sm:h-36' : 'h-24 sm:h-28'
  const color = rank === 1 ? 'from-amber-300 via-yellow-500 to-amber-700' : rank === 2 ? 'from-slate-300 via-slate-400 to-slate-600' : 'from-orange-400 via-orange-600 to-orange-800'
  const shadow = rank === 1 ? 'shadow-[0_0_30px_rgba(234,179,8,0.3)]' : ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, type: 'spring', bounce: 0.4 }}
      className="flex flex-col items-center justify-end w-24 sm:w-32 relative"
    >
      {/* Player Info Above Podium */}
      <div className="flex flex-col items-center text-center mb-3">
        {isFirst && <Trophy className="w-8 h-8 text-yellow-400 mb-2 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)] animate-pulse" />}
        {!isFirst && <Medal className={`w-6 h-6 mb-2 ${rank === 2 ? 'text-slate-300' : 'text-orange-500'}`} />}
        <span className="font-bold text-foreground text-sm sm:text-base truncate w-24 sm:w-32 px-1" title={player.display_name}>
          {player.display_name}
        </span>
        <span className={`font-mono font-bold mt-1 ${isFirst ? 'text-yellow-400 text-lg' : 'text-ieee-light-blue text-sm'}`}>
          {player.balance.toLocaleString()}
        </span>
      </div>

      {/* Podium Block */}
      <div className={`w-full ${height} rounded-t-lg bg-gradient-to-b ${color} p-[1px] ${shadow} relative overflow-hidden group`}>
        <div className="absolute inset-0 bg-black/60 rounded-t-[7px] backdrop-blur-sm" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        
        {/* Glow effect */}
        {isFirst && <div className="absolute -inset-1 bg-gradient-to-t from-yellow-500/20 to-transparent blur-md pointer-events-none" />}
        
        <div className="relative h-full flex items-center justify-center">
          <span className={`font-display text-4xl sm:text-6xl opacity-90 ${
            rank === 1 ? 'text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.4)]' :
            rank === 2 ? 'text-slate-300' : 'text-orange-500'
          }`}>
            {rank}
          </span>
        </div>
      </div>
    </motion.div>
  )
}

function LeaderboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['fifa-leaderboard'],
    queryFn: fetchLeaderboard,
    refetchInterval: 15_000,
  })

  const top3 = data?.leaderboard.slice(0, 3) || []
  const rest = data?.leaderboard.slice(3) || []

  // Ensure podium order is [2, 1, 3] visually
  const podiumOrder = [top3[1], top3[0], top3[2]]

  return (
    <FifaLayout active="leaderboard">
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-10 md:py-16">
        
        <div className="text-center mb-16">
          <h1 className="font-display text-5xl sm:text-6xl text-foreground mb-4 uppercase tracking-tight">
            Leaderboard
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base max-w-lg mx-auto">
            Ranked by balance. In case of a tie, the player with more bets takes the higher rank. Updates every 15s.
          </p>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-ieee-blue/20 border-t-ieee-blue rounded-full animate-spin mb-4" />
            <p className="text-muted-foreground font-medium animate-pulse">Loading standings...</p>
          </div>
        ) : (
          <>
            {data?.leaderboard.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/30 p-12 text-center max-w-md mx-auto">
                <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                <p className="text-lg text-foreground font-medium mb-2">The arena is empty</p>
                <p className="text-muted-foreground text-sm">No players have joined the leaderboard yet. Place a bet to be the first!</p>
              </div>
            ) : (
              <div className="space-y-12">
                {/* Podium Section */}
                <div className="flex items-end justify-center gap-2 sm:gap-6 pt-10">
                  <PodiumStep player={podiumOrder[0]} rank={2} delay={0.2} />
                  <PodiumStep player={podiumOrder[1]} rank={1} delay={0.1} />
                  <PodiumStep player={podiumOrder[2]} rank={3} delay={0.3} />
                </div>

                {/* Info Card */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                  className="rounded-xl border border-ieee-light-blue/20 bg-gradient-to-r from-ieee-light-blue/10 to-transparent p-4 flex items-start sm:items-center gap-4 text-sm text-muted-foreground max-w-2xl mx-auto"
                >
                  <div className="p-2 bg-ieee-light-blue/10 rounded-lg shrink-0">
                    <Info className="w-5 h-5 text-ieee-light-blue" />
                  </div>
                  <div>
                    <p className="text-foreground font-semibold mb-1">Raffle Tickets Formula</p>
                    <p>Tickets = <code className="bg-black/30 px-1.5 py-0.5 rounded text-ieee-light-blue font-mono border border-white/5">max(1, 50 − 2 × (rank − 1))</code></p>
                    <p className="mt-1 opacity-80">Requires at least 5 bets to qualify for the sponsor raffle draw.</p>
                  </div>
                </motion.div>

                {/* Table Section */}
                {rest.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
                    className="bg-card border border-border rounded-2xl overflow-hidden shadow-2xl"
                  >
                    <div className="grid grid-cols-[3rem_1fr_4rem_6rem] sm:grid-cols-[4rem_1fr_6rem_8rem] gap-4 bg-muted/30 p-4 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <div className="text-center">Rank</div>
                      <div>Player</div>
                      <div className="text-right">Bets</div>
                      <div className="text-right pr-2">Points</div>
                    </div>
                    <div className="divide-y divide-border/50">
                      {rest.map((row, i) => (
                        <motion.div
                          key={row.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3, delay: 0.7 + Math.min(i * 0.05, 0.5) }}
                          className="grid grid-cols-[3rem_1fr_4rem_6rem] sm:grid-cols-[4rem_1fr_6rem_8rem] gap-4 p-4 items-center hover:bg-muted/10 transition-colors group"
                        >
                          <div className="text-center font-display text-lg sm:text-xl text-muted-foreground/60 group-hover:text-foreground transition-colors">
                            {row.rank}
                          </div>
                          <div className="font-bold text-sm sm:text-base text-foreground truncate">
                            {row.display_name}
                          </div>
                          <div className="text-right text-xs sm:text-sm text-muted-foreground">
                            {row.bets_count}
                          </div>
                          <div className="text-right pr-2 font-mono text-sm sm:text-base font-bold text-ieee-light-blue">
                            {row.balance.toLocaleString()}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </FifaLayout>
  )
}