import { createFileRoute } from '@tanstack/react-router'
import { FifaLayout } from '@/features/fifa/fifa-layout'

export const Route = createFileRoute('/FIFA/rules')({
  head: () => ({ meta: [{ title: "Rules · WC Predict '26" }] }),
  component: RulesPage,
})

function RulesPage() {
  return (
    <FifaLayout active="rules">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="font-display text-3xl text-ieee-blue mb-6">Rules</h1>

        <section className="mb-8">
          <h2 className="font-display text-xl text-foreground mb-3">The basics</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Free to play. Sign in with your <strong className="text-foreground">@sahrdaya.ac.in</strong> Google account.</li>
            <li>• You start with <strong className="text-foreground">1000 points</strong>. Fake points — no real money anywhere.</li>
            <li>• Bet points on FIFA World Cup matches (quarterfinals onward). Win bets earn points.</li>
            <li>• At the end, a weighted raffle picks the sponsor voucher winner.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="font-display text-xl text-foreground mb-3">Betting limits</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• <strong className="text-foreground">Max 25%</strong> of your balance on a single bet. This is a risk limiter — you can't blow everything on one tap.</li>
            <li>• Minimum stake: 1 point.</li>
            <li>• Bets lock at kickoff. No bets after the match starts.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="font-display text-xl text-foreground mb-3">Market types</h2>
          <p className="text-sm text-muted-foreground mb-3">Each match has several markets. Here's what each one means:</p>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li><strong className="text-foreground">Match Winner</strong> — Pick who <em>advances</em>. Knockouts only — there's no draw outcome (a 90-min draw goes to extra time, but the bet is on who goes through).</li>
            <li><strong className="text-foreground">Total Goals Over/Under</strong> — Whether the 90-minute goal total is over or under a line (e.g. 2.5). Land exactly on an integer line? That's a push — your stake is refunded.</li>
            <li><strong className="text-foreground">Correct Score</strong> — The exact 90-minute score, like <code className="text-foreground">2-1</code>. Format is always <code className="text-foreground">home-away</code>.</li>
            <li><strong className="text-foreground">Anytime Scorer</strong> — Wins if your player scores <em>anytime</em> in regulation + extra time. Not the first scorer — any goal by them counts.</li>
            <li><strong className="text-foreground">Cards Over/Under</strong> — Total cards (yellow + red) over or under a line. Push = refund.</li>
            <li><strong className="text-foreground">Clean Sheet</strong> — A team kept a clean sheet (conceded 0 goals in 90 minutes).</li>
            <li><strong className="text-foreground">Custom</strong> — Admin-defined. The winning option(s) are marked when the match settles.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="font-display text-xl text-foreground mb-3">Pool vs Fixed odds</h2>
          <p className="text-sm text-muted-foreground mb-2">
            Every market is either <strong className="text-foreground">pool</strong> or <strong className="text-foreground">fixed</strong>. The mode is shown on each market card.
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• <strong className="text-foreground">Pool (pari-mutuel)</strong>: All stakes go into one pot. Winners split the pot proportional to their stake. The live pool bar shows how the crowd is betting. No winners? Everyone's refunded.</li>
            <li>• <strong className="text-foreground">Fixed odds</strong>: You get <code className="text-foreground">stake × odds</code> if you win. The odds are locked in when you bet — they don't move after.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="font-display text-xl text-foreground mb-3">Knockout matches</h2>
          <p className="text-sm text-muted-foreground">
            Every match from the quarterfinals onward is a knockout. If it's a draw at 90 minutes, it goes to extra time, then penalties. Here's how that affects bets:
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground mt-2">
            <li>• <strong className="text-foreground">Match Winner</strong> settles on <em>who advances</em>, not the 90-min result.</li>
            <li>• <strong className="text-foreground">Correct Score</strong>, <strong className="text-foreground">Total Goals</strong>, and <strong className="text-foreground">Clean Sheet</strong> settle on the <em>90-minute</em> score only.</li>
            <li>• <strong className="text-foreground">Anytime Scorer</strong> counts goals in regulation <em>and</em> extra time.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="font-display text-xl text-foreground mb-3">Daily top-up</h2>
          <p className="text-sm text-muted-foreground">
            If your balance drops below <strong className="text-foreground">100 points</strong>, you're topped up to <strong className="text-foreground">200</strong> at 9am the next day. You're never fully out — but you won't catch the leaders by waiting for top-ups alone.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="font-display text-xl text-foreground mb-3">Leaderboard & raffle</h2>
          <p className="text-sm text-muted-foreground mb-2">
            The leaderboard ranks by current balance (tiebreak: more bets = higher). At the end of the tournament, a weighted raffle picks the voucher winner:
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• You need at least <strong className="text-foreground">5 bets</strong> to enter the raffle.</li>
            <li>• Tickets = <code className="text-foreground">max(1, 50 − 2 × (rank − 1))</code>. Rank 1 gets 50 tickets, rank 26+ gets 1.</li>
            <li>• Higher rank = more tickets, but everyone who qualifies has a shot.</li>
            <li>• The full ticket list and winning pick are stored publicly for transparency.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="font-display text-xl text-foreground mb-3">Voiding & refunds</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• If a market is voided (e.g. cancelled match, admin error), all pending bets on it are refunded.</li>
            <li>• If a match isn't settled within 6 hours of kickoff, it auto-voids and all bets are refunded.</li>
            <li>• Voided bets return your full stake — you're never penalized for a void.</li>
          </ul>
        </section>
      </div>
    </FifaLayout>
  )
}