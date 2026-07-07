import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { createPB } from '@/lib/pb.server'
import { getField } from '@/lib/safe-get'
import { FifaLayout } from '@/features/fifa/fifa-layout'
import { motion } from 'framer-motion'

interface OverviewData {
  event_name: string
  prize: string
  registration_open: boolean
  nextMatch: {
    id: string
    team_home: string
    team_away: string
    stage: string
    kickoff_at: string
    status: string
  } | null
  playerCount: number
  totalBets: number
}

const fetchOverview = createServerFn().handler(async (): Promise<OverviewData> => {
  const pb = createPB()
  let settings: { event_name: string; prize: string; registration_open: boolean } = {
    event_name: "IEEE Sahrdaya WC Predict '26",
    prize: '',
    registration_open: true,
  }
  try {
    const s = await pb.collection('fifa_settings').getFirstListItem('1=1')
    settings = {
      event_name: getField(s, 'event_name', settings.event_name),
      prize: getField(s, 'prize', ''),
      registration_open: getField(s, 'registration_open', true),
    }
  } catch { /* not seeded yet */ }

  let nextMatch: OverviewData['nextMatch'] = null
  try {
    const m = await pb.collection('fifa_matches').getFirstListItem(
      'status = "upcoming"',
      { sort: 'kickoff_at', fields: 'id,team_home,team_away,stage,kickoff_at,status' },
    )
    nextMatch = {
      id: getField(m, 'id', ''),
      team_home: getField(m, 'team_home', ''),
      team_away: getField(m, 'team_away', ''),
      stage: getField(m, 'stage', ''),
      kickoff_at: getField(m, 'kickoff_at', ''),
      status: getField(m, 'status', 'upcoming'),
    }
  } catch { /* no upcoming matches */ }

  let playerCount = 0
  let totalBets = 0
  try {
    const players = await pb.collection('users').getList(1, 1, { filter: 'balance > 0' })
    playerCount = players.totalItems
  } catch { /* ignore */ }
  try {
    const bets = await pb.collection('fifa_bets').getList(1, 1)
    totalBets = bets.totalItems
  } catch { /* ignore */ }

  return { ...settings, nextMatch, playerCount, totalBets }
})

export const Route = createFileRoute('/FIFA/')({
  head: () => ({
    meta: [
      { title: "IEEE Sahrdaya WC Predict '26" },
      { name: 'description', content: 'Free-to-enter FIFA World Cup prediction game. Bet fake points, climb the leaderboard, win a sponsor voucher.' },
    ],
  }),
  loader: () => fetchOverview(),
  component: FifaOverviewPage,
})

function FifaOverviewPage() {
  const data = Route.useLoaderData() as OverviewData
  const kickoff = data.nextMatch ? new Date(data.nextMatch.kickoff_at) : null
  const timeUntil = kickoff ? kickoff.getTime() - Date.now() : null
  const hoursUntil = timeUntil ? Math.floor(timeUntil / (1000 * 60 * 60)) : null
  const minsUntil = timeUntil ? Math.floor(timeUntil / (1000 * 60)) : null

  return (
    <FifaLayout active="home">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        {/* Hero */}
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-8"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-ieee-light-blue mb-3">
            Free to play · Fake points · Sponsor voucher
          </p>
          <h1 className="font-display text-[clamp(2.2rem,8vw,3.5rem)] text-ieee-blue leading-[0.95] mb-3">
            {data.event_name}
          </h1>
          <p className="text-base text-muted-foreground max-w-prose mx-auto leading-relaxed">
            Predict FIFA World Cup matches, climb the leaderboard, win a voucher. Sign in with your college Google account to place your first bet.
          </p>
        </motion.header>

        {/* Prize chip */}
        {data.prize && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="mb-6 rounded-xl border border-ieee-light-blue/30 bg-gradient-to-br from-ieee-light-blue/10 to-transparent p-5 text-center"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">Prize</p>
            <p className="font-display text-xl text-ieee-blue">{data.prize}</p>
          </motion.div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="rounded-xl border border-border bg-card p-4"
          >
            <p className="font-mono text-[clamp(1.8rem,5vw,2.5rem)] text-ieee-blue leading-none">{data.playerCount}</p>
            <p className="text-xs text-muted-foreground mt-1.5">Players</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="rounded-xl border border-border bg-card p-4"
          >
            <p className="font-mono text-[clamp(1.8rem,5vw,2.5rem)] text-ieee-light-blue leading-none">{data.totalBets}</p>
            <p className="text-xs text-muted-foreground mt-1.5">Bets placed</p>
          </motion.div>
        </div>

        {/* Next match */}
        {data.nextMatch ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.25 }}
          >
            <Link
              to="/FIFA/matches/$id/"
              params={{ id: data.nextMatch.id }}
              className="block rounded-xl border border-border bg-card p-5 hover:border-ieee-light-blue hover:shadow-md transition-all mb-6"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Next match</p>
                {hoursUntil !== null && hoursUntil >= 0 && (
                  <span className="font-mono text-[10px] text-ieee-light-blue">
                    {hoursUntil > 0 ? `${hoursUntil}h` : `${minsUntil}m`} to kickoff
                  </span>
                )}
              </div>
              <p className="font-display text-2xl sm:text-3xl text-foreground leading-tight">
                {data.nextMatch.team_home} <span className="text-muted-foreground text-lg font-sans">vs</span> {data.nextMatch.team_away}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {data.nextMatch.stage.toUpperCase()} · {kickoff?.toLocaleString()}
              </p>
              <p className="text-sm text-ieee-light-blue mt-3 font-medium">View markets & bet →</p>
            </Link>
          </motion.div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-5 text-center text-muted-foreground mb-6">
            No upcoming matches yet. Check back soon.
          </div>
        )}

        {/* How it works */}
        <section className="mb-6">
          <h2 className="font-display text-xl text-foreground mb-4">How it works</h2>
          <ol className="space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-3">
              <span className="font-mono text-ieee-blue flex-shrink-0 font-bold">01</span>
              <span>Sign in with your <strong className="text-foreground">@sahrdaya.ac.in</strong> Google account. You get <strong className="text-foreground">1000 points</strong> to start.</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-ieee-blue flex-shrink-0 font-bold">02</span>
              <span>Pick a match, choose a market (match winner, total goals, anytime scorer...), and place a bet from your points balance.</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-ieee-blue flex-shrink-0 font-bold">03</span>
              <span>Win bets earn points. Pool markets split the pot proportional to your stake. Climb the leaderboard.</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-ieee-blue flex-shrink-0 font-bold">04</span>
              <span>At the end, a weighted raffle picks the voucher winner. Higher rank = more tickets, but everyone has a shot.</span>
            </li>
          </ol>
        </section>

        {/* Quick links */}
        <nav className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Link to="/FIFA/matches/" className="rounded-xl border border-border bg-card p-3 text-center text-sm font-medium hover:border-ieee-light-blue hover:shadow-sm transition-all">Matches</Link>
          <Link to="/FIFA/leaderboard/" className="rounded-xl border border-border bg-card p-3 text-center text-sm font-medium hover:border-ieee-light-blue hover:shadow-sm transition-all">Leaderboard</Link>
          <Link to="/FIFA/feed/" className="rounded-xl border border-border bg-card p-3 text-center text-sm font-medium hover:border-ieee-light-blue hover:shadow-sm transition-all">Live feed</Link>
          <Link to="/FIFA/rules/" className="rounded-xl border border-border bg-card p-3 text-center text-sm font-medium hover:border-ieee-light-blue hover:shadow-sm transition-all">Rules</Link>
        </nav>
      </div>
    </FifaLayout>
  )
}