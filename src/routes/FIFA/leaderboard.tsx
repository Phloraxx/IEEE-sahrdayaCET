import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { FifaLayout } from '@/features/fifa/fifa-layout'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/lib/auth-context'
import { Info, Trophy, Medal, Award, Ticket } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

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
    raffle_tickets_base: number
    raffle_tickets_decay: number
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

function LeaderboardPage() {
  const { user, status } = useAuth()
  const { data, isLoading } = useQuery({
    queryKey: ['fifa-leaderboard'],
    queryFn: fetchLeaderboard,
    refetchInterval: 15_000,
  })

  const [showAll, setShowAll] = useState(false)

  const rows = data?.leaderboard || []
  const visibleRows = showAll ? rows : rows.slice(0, 50)
  
  const settings = data?.settings || { raffle_tickets_base: 50, raffle_tickets_decay: 2, min_bets: 5 }
  
  const totalPlayers = rows.length
  const totalBets = rows.reduce((acc, r) => acc + r.bets_count, 0)
  const totalPoints = rows.reduce((acc, r) => acc + r.balance, 0)
  
  const myRow = user ? rows.find(r => r.id === user.id) : null

  const getTickets = (rank: number, bets: number) => {
    if (bets < settings.min_bets) return 0
    return Math.max(1, settings.raffle_tickets_base - settings.raffle_tickets_decay * (rank - 1))
  }

  const RankIcon = ({ rank }: { rank: number }) => {
    if (rank === 1) return <Trophy className="h-6 w-6 text-amber-400 drop-shadow-md" />
    if (rank === 2) return <Medal className="h-6 w-6 text-slate-300 drop-shadow-sm" />
    if (rank === 3) return <Award className="h-6 w-6 text-amber-700 drop-shadow-sm" />
    return <span className="font-display text-xl text-muted-foreground w-6 text-center block">{rank}</span>
  }

  return (
    <FifaLayout active="leaderboard">
      <div className="mx-auto max-w-3xl px-4 py-8">
        
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-4xl text-ieee-blue mb-1 uppercase tracking-tight">Leaderboard</h1>
            <p className="text-sm text-muted-foreground">Ranked by points. Tiebreak: more bets placed.</p>
          </div>
          
          {/* Raffle Info Strip */}
          <div className="flex items-center gap-2 bg-ieee-light-blue/10 border border-ieee-light-blue/20 rounded-full px-4 py-1.5 text-sm text-ieee-blue w-fit">
            <Ticket className="w-4 h-4 shrink-0" />
            <span className="font-medium">Raffle Entry</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors outline-none cursor-pointer">
                    <Info className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  <p className="font-semibold mb-1">Raffle Tickets Formula</p>
                  <p className="mb-1 text-muted-foreground">Tickets = max(1, {settings.raffle_tickets_base} - {settings.raffle_tickets_decay} × (rank - 1))</p>
                  <p className="text-muted-foreground">You need at least {settings.min_bets} bets to qualify for the prize draw.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Mini Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          
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
                      <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-0.5">Points</p>
                      <p className="font-mono font-bold text-lg text-ieee-blue">{myRow.balance.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-0.5">Bets</p>
                      <p className="font-mono font-medium text-lg">{myRow.bets_count}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-0.5">Tickets</p>
                      <p className="font-mono font-medium text-lg flex items-center gap-1">
                        {getTickets(myRow.rank, myRow.bets_count)}
                        <Ticket className="w-3.5 h-3.5 text-muted-foreground" />
                      </p>
                    </div>
                  </div>
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
                <p className="font-mono text-xl font-semibold text-ieee-blue truncate px-1">{totalPoints > 99999 ? (totalPoints/1000).toFixed(1)+'k' : totalPoints}</p>
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider mt-1">Pts in Play</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Leaderboard List */}
        <div className="space-y-2">
          {isLoading && <p className="text-muted-foreground text-center py-8">Loading rankings...</p>}
          
          <AnimatePresence>
            {visibleRows.map((row, i) => {
              const isMe = user?.id === row.id
              const isTop3 = row.rank <= 3
              
              return (
                <motion.div
                  key={row.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.3) }}
                  className={`flex items-center gap-3 sm:gap-4 rounded-xl p-3 sm:p-4 border transition-all ${
                    isMe 
                      ? 'border-ieee-blue/40 bg-ieee-blue/5 shadow-sm' 
                      : isTop3
                        ? 'border-border/80 bg-gradient-to-r from-card to-muted/20'
                        : 'border-border bg-card hover:border-border/80'
                  }`}
                >
                  <div className="w-10 flex justify-center shrink-0">
                    <RankIcon rank={row.rank} />
                  </div>
                  
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <div className="truncate w-full">
                      <div className="flex items-center gap-2">
                        <p className={`font-bold truncate ${isTop3 ? 'text-base' : 'text-sm'} text-foreground`}>
                          {row.display_name}
                        </p>
                        {isMe && <span className="shrink-0 text-[10px] uppercase font-bold tracking-wider text-white bg-ieee-blue px-1.5 py-0.5 rounded">You</span>}
                      </div>
                      <p className="text-[11px] text-muted-foreground font-medium mt-0.5">{row.bets_count} bets placed</p>
                    </div>
                  </div>
                  
                  <div className="text-right shrink-0">
                    <p className={`font-mono font-bold ${isTop3 ? 'text-lg text-ieee-blue' : 'text-base text-foreground'}`}>
                      {row.balance.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-medium flex items-center justify-end gap-1 mt-0.5">
                      {getTickets(row.rank, row.bets_count)}
                      <Ticket className="w-3 h-3" />
                    </p>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
          
          {rows.length === 0 && !isLoading && (
            <div className="text-center py-12 border border-dashed rounded-xl bg-card">
              <p className="text-muted-foreground">No players have joined the leaderboard yet.</p>
            </div>
          )}
        </div>

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
    </FifaLayout>
  )
}