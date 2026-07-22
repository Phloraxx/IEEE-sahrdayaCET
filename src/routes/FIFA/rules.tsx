
import { FifaLayout } from '@/features/fifa/fifa-layout'
import { AlertCircle, ArrowRight, ShieldCheck, Trophy, Banknote, HelpCircle, Activity, Gift, Clock, RefreshCcw, Scale, Users } from 'lucide-react'

export default function RulesPage() {
  return (
    <FifaLayout active="rules">
      <div className="w-full flex-1 flex flex-col bg-[#0a0a0b]">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-10 md:py-16">
          
          <div className="mb-12 border-b border-border pb-8">
            <h1 className="font-display text-4xl sm:text-5xl text-ieee-light-blue uppercase tracking-tight mb-4">
              Game Rules
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              Everything you need to know about placing bets, understanding markets, and winning the grand prize.
            </p>
          </div>

          <div className="space-y-16">
            
            {/* THE BASICS */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-ieee-blue/10 flex items-center justify-center border border-ieee-blue/20">
                  <span className="font-display text-xl text-ieee-blue">1</span>
                </div>
                <h2 className="font-display text-2xl sm:text-3xl text-foreground uppercase tracking-wider">The Basics</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl bg-[#111113] border border-border p-5 flex items-start gap-4">
                  <ShieldCheck className="w-6 h-6 text-ieee-success mt-1 shrink-0" />
                  <div>
                    <h4 className="font-bold text-foreground mb-1">Free to Play</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">Sign in with your <strong className="text-foreground">@sahrdaya.ac.in</strong> Google account. This game uses fake tickets — no real money is involved anywhere.</p>
                  </div>
                </div>
                
                <div className="rounded-xl bg-[#111113] border border-border p-5 flex items-start gap-4">
                  <Banknote className="w-6 h-6 text-ieee-light-blue mt-1 shrink-0" />
                  <div>
                    <h4 className="font-bold text-foreground mb-1">Starting tickets</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">You start with <strong className="text-foreground">1000 tickets</strong>. Stake tickets on matches to win more. Higher ticket balance means a better leaderboard rank.</p>
                  </div>
                </div>
              </div>
            </section>

            {/* BETTING LIMITS */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-ieee-blue/10 flex items-center justify-center border border-ieee-blue/20">
                  <span className="font-display text-xl text-ieee-blue">2</span>
                </div>
                <h2 className="font-display text-2xl sm:text-3xl text-foreground uppercase tracking-wider">Betting Limits</h2>
              </div>
              
              <div className="rounded-xl border border-ieee-warning/20 bg-ieee-warning/5 p-6 mb-6">
                <div className="flex items-start gap-4">
                  <AlertCircle className="w-6 h-6 text-ieee-warning mt-0.5 shrink-0" />
                  <div>
                    <h4 className="font-bold text-foreground mb-1">Max Bet is 25%</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      You can bet a maximum of <strong className="text-foreground">25% of your current tickets</strong> on a single bet. This is a risk limiter to prevent blowing everything on one tap.
                    </p>
                  </div>
                </div>
              </div>
              
              <ul className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <li className="rounded-full bg-[#111113] border border-border px-4 py-2 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-ieee-light-blue" />
                  Minimum stake: 1 ticket
                </li>
                <li className="rounded-full bg-[#111113] border border-border px-4 py-2 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-ieee-light-blue" />
                  Bets lock exactly at kickoff
                </li>
              </ul>
            </section>

            {/* POOL VS FIXED */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-ieee-blue/10 flex items-center justify-center border border-ieee-blue/20">
                  <span className="font-display text-xl text-ieee-blue">3</span>
                </div>
                <h2 className="font-display text-2xl sm:text-3xl text-foreground uppercase tracking-wider">Odds & Payouts</h2>
              </div>
              
              <p className="text-muted-foreground mb-6 max-w-3xl">Every market operates in one of two modes, clearly marked on the betting card.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-xl border border-border bg-[#111113] p-6 relative overflow-hidden group hover:border-ieee-light-blue transition-colors">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-ieee-light-blue/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-ieee-light-blue/10 transition-colors" />
                  <div className="relative z-10">
                    <div className="inline-flex items-center gap-2 rounded bg-muted/50 px-2 py-1 text-xs font-mono font-bold uppercase tracking-widest text-foreground mb-4">
                      <Users className="w-3.5 h-3.5" /> Pool
                    </div>
                    <h4 className="text-xl font-bold text-foreground mb-3">Pari-Mutuel Betting</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                      All stakes go into one pot. Winners split the pot proportional to their stake. The live pool bar shows how the crowd is betting.
                    </p>
                    <div className="rounded-lg bg-card border border-border p-3 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">Rule:</span> No winners? Everyone is fully refunded.
                    </div>
                  </div>
                </div>
                
                <div className="rounded-xl border border-border bg-[#111113] p-6 relative overflow-hidden group hover:border-ieee-blue transition-colors">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-ieee-blue/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-ieee-blue/10 transition-colors" />
                  <div className="relative z-10">
                    <div className="inline-flex items-center gap-2 rounded bg-muted/50 px-2 py-1 text-xs font-mono font-bold uppercase tracking-widest text-foreground mb-4">
                      <Scale className="w-3.5 h-3.5" /> Fixed
                    </div>
                    <h4 className="text-xl font-bold text-foreground mb-3">Fixed Odds</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                      You get <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">stake × odds</code> if you win. The odds are locked in when you place your bet — they will not change afterward.
                    </p>
                    <div className="rounded-lg bg-card border border-border p-3 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">Example:</span> 50 tickets at 1.50× pays out 75 tickets.
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* MARKET TYPES */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-ieee-blue/10 flex items-center justify-center border border-ieee-blue/20">
                  <span className="font-display text-xl text-ieee-blue">4</span>
                </div>
                <h2 className="font-display text-2xl sm:text-3xl text-foreground uppercase tracking-wider">Market Types</h2>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="rounded-xl border border-border bg-card p-5">
                  <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
                    Match Winner
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Pick who <em>advances</em>. Knockouts only — there is no draw outcome (a 90-min draw goes to extra time, but the bet is on who ultimately goes through).
                  </p>
                </div>
                
                <div className="rounded-xl border border-border bg-card p-5">
                  <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
                    Total Goals (O/U)
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Whether the 90-minute goal total is over or under a line (e.g. 2.5). Land exactly on an integer line? That's a push — your stake is refunded.
                  </p>
                </div>
                
                <div className="rounded-xl border border-border bg-card p-5">
                  <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
                    Correct Score
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    The exact 90-minute score, like <code className="text-foreground bg-muted px-1 rounded">2-1</code>. Order matches the teams as listed on the match (first team–second team).
                  </p>
                </div>
                
                <div className="rounded-xl border border-border bg-card p-5">
                  <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
                    Anytime Scorer
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Wins if your player scores <em>anytime</em> in regulation + extra time. Any goal by them counts, it doesn't have to be the first.
                  </p>
                </div>
                
                <div className="rounded-xl border border-border bg-card p-5">
                  <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
                    Clean Sheet
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    A team kept a clean sheet (conceded 0 goals in 90 minutes).
                  </p>
                </div>
                
                <div className="rounded-xl border border-border bg-card p-5">
                  <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
                    Custom
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Admin-defined fun markets. The winning option(s) are marked when the match settles.
                  </p>
                </div>
              </div>
            </section>

            {/* KNOCKOUT MATCHES FLOW */}
            <section className="rounded-2xl border border-border bg-gradient-to-br from-[#111113] to-[#0a0a0b] p-6 sm:p-8">
              <h2 className="font-display text-2xl text-foreground uppercase tracking-wider mb-2">Knockout Phase Rules</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
                Every match from the quarterfinals onward is a knockout. If it's a draw at 90 minutes, it goes to extra time, then penalties.
              </p>
              
              <div className="flex flex-col md:flex-row gap-4 items-stretch justify-between bg-[#0a0a0b] border border-border rounded-xl p-4 md:p-6 mb-6 overflow-hidden">
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-foreground uppercase tracking-wider mb-2">90 Minutes Only</h4>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    <li>• Correct Score</li>
                    <li>• Total Goals</li>
                    <li>• Clean Sheet</li>
                  </ul>
                </div>
                
                <div className="hidden md:flex items-center justify-center opacity-50">
                  <ArrowRight className="w-6 h-6 text-muted-foreground" />
                </div>
                
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-ieee-light-blue uppercase tracking-wider mb-2">Includes Extra Time</h4>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    <li>• Anytime Scorer</li>
                  </ul>
                </div>
                
                <div className="hidden md:flex items-center justify-center opacity-50">
                  <ArrowRight className="w-6 h-6 text-muted-foreground" />
                </div>
                
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-ieee-success uppercase tracking-wider mb-2">Who Advances</h4>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    <li>• Match Winner</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* DAILY TOP-UP & VOIDING */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-xl border border-border bg-card p-6 flex flex-col h-full">
                <div className="flex items-center gap-3 mb-4">
                  <RefreshCcw className="w-5 h-5 text-ieee-light-blue" />
                  <h3 className="font-display text-xl uppercase text-foreground">Daily Top-up</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  If your ticket balance drops below <strong className="text-foreground">100 tickets</strong>, you are automatically topped up to <strong className="text-foreground">200 tickets</strong> at 9am the next day. You're never fully out — but you won't catch the leaders by waiting for top-ups alone.
                </p>
              </div>
              
              <div className="rounded-xl border border-border bg-card p-6 flex flex-col h-full">
                <div className="flex items-center gap-3 mb-4">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  <h3 className="font-display text-xl uppercase text-foreground">Voiding & Refunds</h3>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed">
                  <li>• <strong className="text-foreground">Pool markets:</strong> if nobody picked the winning option (e.g. correct score was 2-1 but no one bet it), every bet on that market is refunded — not marked as a loss.</li>
                  <li>• If a market is voided (e.g. cancelled match), all pending bets on it are fully refunded.</li>
                  <li>• If a match isn't settled within 6 hours of kickoff, it auto-voids and all bets are refunded.</li>
                  <li>• Voided bets return your full stake — you are never penalized.</li>
                </ul>
              </div>
            </section>

            {/* LEADERBOARD & RAFFLE */}
            <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 sm:p-10 text-center relative overflow-hidden">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-amber-500/10 rounded-full blur-[60px]" />
              <div className="relative z-10 max-w-3xl mx-auto">
                <div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto mb-6 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                  <Trophy className="w-8 h-8 text-amber-500" />
                </div>
                
                <h2 className="font-display text-3xl sm:text-4xl text-amber-500 uppercase tracking-wider mb-4">Leaderboard &amp; prize draw</h2>
                
                <p className="text-base text-foreground mb-4">
                  One scoreboard: you rank by <strong className="text-foreground">tickets</strong> (tiebreak: more bets placed). At the end of the tournament, a weighted random draw picks the grand prize winner.
                </p>
                <p className="text-sm text-muted-foreground mb-8 max-w-2xl mx-auto">
                  <strong className="text-foreground">#1 on the leaderboard does not automatically win the voucher.</strong> Higher rank improves your odds in the draw, but any eligible player can win.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left max-w-xl mx-auto">
                  <div className="bg-[#0a0a0b] border border-amber-500/20 rounded-xl p-4">
                    <h4 className="font-bold text-foreground mb-1 text-sm">Eligibility</h4>
                    <p className="text-xs text-muted-foreground">You need at least <strong className="text-foreground">5 bets</strong> to enter the prize draw.</p>
                  </div>
                  <div className="bg-[#0a0a0b] border border-amber-500/20 rounded-xl p-4">
                    <h4 className="font-bold text-foreground mb-1 text-sm">Transparency</h4>
                    <p className="text-xs text-muted-foreground">The draw snapshot and winning pick are stored for verification.</p>
                  </div>
                </div>
              </div>
            </section>

          </div>
        </div>
      </div>
    </FifaLayout>
  )
}