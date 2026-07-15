import { useAuth } from '@/lib/auth-context'
import { motion } from 'framer-motion'

export function FifaCtaBand() {
  const { status, signIn } = useAuth()

  if (status === 'authenticated') return null

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden bg-gradient-to-br from-ieee-blue to-[#003c5f] px-[clamp(20px,4vw,48px)] py-[70px] text-center text-white"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255,255,255,.14) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
        }}
      />
      <div className="relative z-[1] mx-auto max-w-[560px]">
        <span className="font-pixel mb-[18px] block text-[clamp(10px,1.4vw,13px)] tracking-[0.1em] text-ieee-light-blue">
          WC PREDICT &apos;26
        </span>
        <h2 className="font-display mb-3.5 text-[clamp(28px,4.5vw,46px)] leading-[1.05] uppercase">
          Your bracket. Your tickets. Your voucher.
        </h2>
        <p className="mb-6 text-sm leading-relaxed opacity-85">
          Free to enter — fake tickets only. Sign in with your @sahrdaya.ac.in account and place your
          first bet before kickoff.
        </p>
        <button
          type="button"
          onClick={signIn}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border-0 bg-white px-6 py-3.5 text-sm font-extrabold text-ieee-blue transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(0,0,0,.25)]"
        >
          Sign in with Google →
        </button>
      </div>
    </motion.section>
  )
}