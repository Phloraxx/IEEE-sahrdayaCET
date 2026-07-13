import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { FifaLayout } from '@/features/fifa/fifa-layout'
import { motion } from 'framer-motion'
import { useAuth } from '@/lib/auth-context'
import { Trophy, Medal } from 'lucide-react'

interface LeaderboardRow {
  rank: number
  id: string
  display_name: string
  balance: number
  bets_count: number
}

interface LeaderboardData {
  leaderboard: LeaderboardRow[]
  settings: {
    min_bets: number
  }
}

async function fetchLeaderboard(): Promise<LeaderboardData> {
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
  const { user, status } = useAuth()
  const { data, isLoading } = useQuery({
    queryKey: ['fifa-leaderboard'],
    queryFn: fetchLeaderboard,
    refetchInterval: 15_000,
  })

  const [showAll, setShowAll] = useState(false)

  const rows = data?.leaderboard || []
  const settings = data?.settings || { min_bets: 5 }

  const totalPlayers = rows.length
  const totalBets = rows.reduce((acc, r) => acc + r.bets_count, 0)
  const totalTickets = rows.reduce((acc, r) => acc + r.balance, 0)

  const myRow = user ? rows.find((r) => r.id === user.id) : null

  const top3 = rows.slice(0, 3)
  const rest = showAll ? rows.slice(3) : rows.slice(3, 50)

  const podiumOrder = [top3[1], top3[0], top3[2]]

  return (
    <FifaLayout active="leaderboard">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-10 md:py-16">
        
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10 text-center md:text-left">
          <div>
            <h1 className="font-display text-5xl sm:text-6xl text-foreground mb-2 uppercase tracking-tight">Leaderboard</h1>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto md:mx-0">Ranked by tickets (tiebreak: more bets placed). Updates every 15s.</p>
            <p className="text-xs text-muted-foreground/90 max-w-lg mx-auto md:mx-0 mt-2">
              The grand prize is one random draw weighted by rank — #1 does not automatically win the voucher.
            </p>
          </div>
        </div>

        {/* Mini Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
          {/* Your Rank Card */}
          <div className="rounded-xl border border-ieee-blue/20 bg-gradient-to-br from-card to-ieee-blue/5 p-5 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
              <Trophy className="w-24 h-24" />
            </div>
            {status === 'authenticated' ? (
              myRow ? (
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold uppercase tracking-wider text-ieee-blue bg-ieee-blue/10 px-2 py-1 rounded">You</span>
                    <span className="text-2xl font-display text-foreground">#{myRow.rank}</span>
                  </div>
                  <h3 className="text-xl font-semibold mb-1 truncate pr-8">{myRow.display_name}</h3>
                  <div className="flex flex-wrap gap-4 mt-4">
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-0.5">Tickets</p>
                      <p className="font-mono font-bold text-lg text-ieee-blue">{myRow.balance.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-0.5">Bets</p>
                      <p className="font-mono font-medium text-lg">{myRow.bets_count}</p>
                    </div>
                  </div>
                  {myRow.bets_count < settings.min_bets && (
                    <p className="text-xs text-amber-500/90 mt-3 font-medium">
                      Place {settings.min_bets - myRow.bets_count} more bet{settings.min_bets - myRow.bets_count === 1 ? '' : 's'} to enter the prize draw.
                    </p>
                  )}
                </div>
              ) : (
                <div className="relative z-10 h-full flex flex-col justify-center">
                  <h3 className="font-semibold text-lg mb-2">Unranked</h3>
                  <p className="text-sm text-muted-foreground mb-4">Place a bet to join the leaderboard and compete for the prize.</p>
                  <Link to="/FIFA/matches" className="text-sm font-medium text-ieee-light-blue hover:underline">View Matches →</Link>
                </div>
              )
            ) : (
              <div className="relative z-10 h-full flex flex-col items-center justify-center text-center py-4">
                <p className="text-muted-foreground text-sm mb-3">Log in to see your personal stats and rank.</p>
                <Link to="/FIFA/dashboard" className="rounded bg-ieee-blue text-white px-4 py-2 text-sm font-medium hover:bg-ieee-light-blue transition-colors inline-block">Sign In</Link>
              </div>
            )}
          </div>

          {/* Top Players Global Stats */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col justify-center">
            <h3 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">Global Stats</h3>
            <div className="grid grid-cols-3 gap-2 text-center divide-x divide-border">
              <div>
                <p className="font-mono text-2xl font-semibold text-foreground">{totalPlayers}</p>
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider mt-1">Players</p>
              </div>
              <div>
                <p className="font-mono text-2xl font-semibold text-foreground">{totalBets}</p>
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider mt-1">Bets Placed</p>
              </div>
              <div>
                <p className="font-mono text-xl font-semibold text-ieee-blue truncate px-1">{totalTickets > 99999 ? `${(totalTickets / 1000).toFixed(1)}k` : totalTickets.toLocaleString()}</p>
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider mt-1">Tickets in play</p>
              </div>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-ieee-blue/20 border-t-ieee-blue rounded-full animate-spin mb-4" />
            <p className="text-muted-foreground font-medium animate-pulse">Loading standings...</p>
          </div>
        ) : (
          <>
            {rows.length === 0 ? (
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

                {/* Table Section */}
                {rest.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
                    className="bg-card border border-border rounded-2xl overflow-hidden shadow-2xl"
                  >
                    <div className="grid grid-cols-[3rem_1fr_5rem_5rem] gap-4 bg-muted/30 p-4 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <div className="text-center">Rank</div>
                      <div>Player</div>
                      <div className="text-right">Bets</div>
                      <div className="text-right pr-2">Tickets</div>
                    </div>
                    <div className="divide-y divide-border/50">
                      {rest.map((row, i) => {
                        const isMe = user?.id === row.id
                        return (
                          <motion.div
                            key={row.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3, delay: 0.7 + Math.min(i * 0.05, 0.5) }}
                            className={`grid grid-cols-[3rem_1fr_5rem_5rem] gap-4 p-4 items-center transition-colors group ${
                              isMe ? 'bg-ieee-blue/10 border-l-2 border-l-ieee-blue' : 'hover:bg-muted/10'
                            }`}
                          >
                            <div className="text-center font-display text-lg sm:text-xl text-muted-foreground/60 group-hover:text-foreground transition-colors">
                              {row.rank}
                            </div>
                            <div className="flex items-center gap-2 truncate">
                              <span className="font-bold text-sm sm:text-base text-foreground truncate">
                                {row.display_name}
                              </span>
                              {isMe && <span className="shrink-0 text-[9px] uppercase font-bold tracking-wider text-white bg-ieee-blue px-1.5 py-0.5 rounded">You</span>}
                            </div>
                            <div className="text-right text-xs sm:text-sm text-muted-foreground">
                              {row.bets_count}
                            </div>
                            <div className="text-right pr-2 font-mono text-sm sm:text-base font-bold text-ieee-light-blue">
                              {row.balance.toLocaleString()}
                            </div>
                          </motion.div>
                        )
                      })}
                    </div>
                  </motion.div>
                )}
                
                {/* Load More */}
                {rows.length > 50 && !showAll && (
                  <div className="mt-8 text-center">
                    <button 
                      onClick={() => setShowAll(true)}
                      className="rounded-full border border-border bg-card px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors shadow-sm cursor-pointer"
                    >
                      Show All {rows.length} Players
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </FifaLayout>
  )
}