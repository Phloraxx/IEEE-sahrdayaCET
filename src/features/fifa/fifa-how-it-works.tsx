import { motion } from 'framer-motion'

const STEPS = [
  {
    num: '01',
    text: (
      <>
        Sign in with your <strong className="text-[#f5f5f5]">@sahrdaya.ac.in</strong> Google
        account. You get <strong className="text-[#f5f5f5]">1000 points</strong> to start.
      </>
    ),
  },
  {
    num: '02',
    text: (
      <>
        Pick a match, choose a market — <strong className="text-[#f5f5f5]">Match Winner</strong>,{' '}
        <strong className="text-[#f5f5f5]">Total Goals O/U</strong>,{' '}
        <strong className="text-[#f5f5f5]">Anytime Scorer</strong> — and place a bet from your
        points balance.
      </>
    ),
  },
  {
    num: '03',
    text: (
      <>
        Win bets earn points. Pool markets split the pot proportional to your stake. Climb the
        leaderboard.
      </>
    ),
  },
  {
    num: '04',
    text: (
      <>
        At the end, a weighted raffle picks the voucher winner. Higher rank = more tickets, but
        everyone has a shot.
      </>
    ),
  },
]

export function FifaHowItWorks() {
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
          Predict FIFA World Cup matches, climb the leaderboard, win a voucher. Sign in with your
          college Google account to place your first bet.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step) => (
          <div
            key={step.num}
            className="rounded-[14px] border border-white/10 bg-[#131519] p-5"
          >
            <span className="mb-2.5 block font-mono text-[22px] font-extrabold text-ieee-light-blue">
              {step.num}
            </span>
            <p className="text-[13.5px] leading-relaxed text-[#9a9aa2]">{step.text}</p>
          </div>
        ))}
      </div>
    </motion.section>
  )
}