import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { createPB } from '@/lib/pb.server'
import { getField } from '@/lib/safe-get'
import { FifaLayout } from '@/features/fifa/fifa-layout'

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

  return (
    <FifaLayout active="home">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        {/* Hero */}
        <header className="text-center mb-10">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-ieee-light-blue mb-3">
            Free to play · Fake points · Sponsor voucher prize
          </p>
          <h1 className="font-display text-4xl sm:text-5xl text-ieee-blue leading-[1.05] mb-4">
            {data.event_name}
          </h1>
          <p className="text-base text-muted-foreground max-w-prose mx-auto">
            Predict FIFA World Cup matches, climb the leaderboard, win a sponsor voucher.
            Sign in with your college Google account to place your first bet.
          </p>
        </header>

        {/* Prize chip */}
        {data.prize && (
          <div className="mb-8 rounded-lg border border-border bg-card p-4 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">Prize</p>
            <p className="font-display text-xl text-foreground">{data.prize}</p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="font-mono text-3xl text-ieee-blue">{data.playerCount}</p>
            <p className="text-sm text-muted-foreground mt-1">Players</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="font-mono text-3xl text-ieee-light-blue">{data.totalBets}</p>
            <p className="text-sm text-muted-foreground mt-1">Bets placed</p>
          </div>
        </div>

        {/* Next match */}
        {data.nextMatch ? (
          <Link
            to="/FIFA/matches/$id/"
            params={{ id: data.nextMatch.id }}
            className="block rounded-lg border border-border bg-card p-5 hover:border-ieee-light-blue transition-colors mb-8"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">Next match</p>
            <p className="font-display text-2xl text-foreground">
              {data.nextMatch.team_home} <span className="text-muted-foreground">vs</span> {data.nextMatch.team_away}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {data.nextMatch.stage.toUpperCase()} · {new Date(data.nextMatch.kickoff_at).toLocaleString()}
            </p>
            <p className="text-sm text-ieee-light-blue mt-3 font-medium">View markets & bet →</p>
          </Link>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-5 text-center text-muted-foreground mb-8">
            No upcoming matches yet. Check back soon.
          </div>
        )}

        {/* How it works */}
        <section className="mb-8">
          <h2 className="font-display text-xl text-foreground mb-4">How it works</h2>
          <ol className="space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-3">
              <span className="font-mono text-ieee-blue flex-shrink-0">01</span>
              <span>Sign in with your <strong className="text-foreground">@sahrdaya.ac.in</strong> Google account. You get <strong className="text-foreground">1000 points</strong> to start.</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-ieee-blue flex-shrink-0">02</span>
              <span>Pick a match, choose a market (match winner, total goals, anytime scorer...), and place a bet from your points balance.</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-ieee-blue flex-shrink-0">03</span>
              <span>Win bets earn points. Pool markets split the pot proportional to your stake. Climb the leaderboard.</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-ieee-blue flex-shrink-0">04</span>
              <span>At the end, a weighted raffle picks the voucher winner. Higher rank = more tickets, but everyone has a shot.</span>
            </li>
          </ol>
        </section>

        {/* Quick links */}
        <nav className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Link to="/FIFA/matches/" className="rounded-lg border border-border bg-card p-3 text-center text-sm font-medium hover:border-ieee-light-blue transition-colors">Matches</Link>
          <Link to="/FIFA/leaderboard/" className="rounded-lg border border-border bg-card p-3 text-center text-sm font-medium hover:border-ieee-light-blue transition-colors">Leaderboard</Link>
          <Link to="/FIFA/feed/" className="rounded-lg border border-border bg-card p-3 text-center text-sm font-medium hover:border-ieee-light-blue transition-colors">Live feed</Link>
          <Link to="/FIFA/dashboard/" className="rounded-lg border border-border bg-card p-3 text-center text-sm font-medium hover:border-ieee-light-blue transition-colors">My dashboard</Link>
        </nav>
      </div>
    </FifaLayout>
  )
}
