import { motion } from 'framer-motion'

interface HowItWorksProps {
  startingBalance: number
  maxBetPercent: number
  raffleMinBets: number
}

export function FifaHowItWorks({ startingBalance, maxBetPercent, raffleMinBets }: HowItWorksProps) {
  const STEPS = [
    {
      num: '01',
      title: 'When you can bet',
      text: (
        <>
          Bets are open from when a market is created until kickoff time (or a specific lock time). Once the match goes live, betting is automatically locked by the system — no late bets accepted.
        </>
      ),
    },
    {
      num: '02',
      title: 'How to place a bet',
      text: (
        <>
          Log in with your college Google account to get <strong className="text-[#f5f5f5]">{startingBalance} points</strong> to start. Pick an upcoming match and choose a market. Enter your stake (maximum <strong className="text-[#f5f5f5]">{maxBetPercent}%</strong> of your balance). Points are deducted immediately.
        </>
      ),
    },
    {
      num: '03',
      title: 'Pool vs Fixed Odds',
      text: (
        <>
          <strong className="text-[#f5f5f5]">Pool markets:</strong> You bet against other students. Winners split the pot. If nobody picked the winning outcome, everyone gets refunded. <strong className="text-[#f5f5f5]">Fixed markets:</strong> The payout multiplier is set upfront — wrong picks lose their stake.
        </>
      ),
    },
    {
      num: '04',
      title: 'How you win points',
      text: (
        <>
          A correct prediction pays out after settlement. A wrong pick loses the stake. Refunds (shown as 'Refunded' on your dashboard) happen when a pool has no winner or a market is voided — you get your full stake back.
        </>
      ),
    },
    {
      num: '05',
      title: 'The Raffle',
      text: (
        <>
          At the end of the tournament, a prize raffle is drawn. Higher leaderboard rank = more raffle tickets. You need at least <strong className="text-[#f5f5f5]">{raffleMinBets} bets</strong> placed to be eligible, but every active participant gets at least 1 ticket!
        </>
      ),
    },
  ]

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
          How WC Predict &apos;26 works
        </h2>
        <p className="mt-2 max-w-[560px] text-sm text-[#9a9aa2]">
          Predict FIFA World Cup matches, climb the leaderboard, win a voucher. Everything you need to know about the game mechanics.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((step) => (
          <div
            key={step.num}
            className="rounded-[14px] border border-white/10 bg-[#131519] p-5"
          >
            <div className="flex items-center gap-3 mb-2.5">
              <span className="font-mono text-[22px] font-extrabold text-ieee-light-blue">
                {step.num}
              </span>
              <h3 className="font-semibold text-white/90">{step.title}</h3>
            </div>
            <p className="text-[13.5px] leading-relaxed text-[#9a9aa2]">{step.text}</p>
          </div>
        ))}
      </div>
    </motion.section>
  )
}