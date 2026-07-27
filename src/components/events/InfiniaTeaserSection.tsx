import { motion, useReducedMotion } from "framer-motion";

const LEGACY = [
  ["ALTAIR", "'22"],
  ["ALTAIR 2.0", "'23"],
  ["INFINIA", "'24"],
  ["INFINIA 2.0", "'25"],
  ["???", "'26"],
] as const;

const INGREDIENTS = [
  { label: "ideas", className: "left-[8%] top-[38%] -rotate-12 text-[#EA4335]" },
  { label: "tech", className: "left-[31%] top-[31%] rotate-6 text-ieee-blue" },
  { label: "people", className: "left-[23%] top-[48%] -rotate-6 text-[#34A853]" },
  { label: "chaos", className: "left-[43%] top-[43%] rotate-12 text-[#FBBC05]" },
] as const;

export function InfiniaTeaserSection() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      aria-labelledby="infinia-teaser-title"
      initial={reduceMotion ? false : { opacity: 0, y: 36 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-120px" }}
      transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto mt-28 max-w-[1240px] px-0 sm:px-4"
    >
      <div className="relative isolate overflow-hidden rounded-[2rem] bg-[#FFF8DC] px-5 pb-0 pt-12 shadow-[0_28px_90px_rgba(15,23,42,0.08)] sm:rounded-[3rem] sm:px-10 lg:min-h-[720px] lg:px-14 lg:pt-16">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-[#FBBC05]/20 blur-3xl" />
          <div className="absolute right-[-8rem] top-[-6rem] h-96 w-96 rounded-full bg-ieee-blue/10 blur-3xl" />
          <p className="absolute left-1/2 top-[23%] -translate-x-1/2 whitespace-nowrap text-[clamp(6rem,18vw,15rem)] font-black leading-none tracking-[-0.08em] text-ieee-blue/[0.055]">
            COOKING
          </p>
          <div className="absolute inset-x-10 top-9 border-t border-slate-900/10" />
        </div>

        <div className="relative z-10 grid items-end gap-2 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="relative order-2 min-h-[500px] self-end lg:order-1 lg:min-h-[640px]">
            <motion.img
              src="/images/infinia-chef.svg"
              alt="Chef flipping food in a pan"
              initial={reduceMotion ? false : { opacity: 0, y: 42, rotate: -2 }}
              whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, rotate: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.12, duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
              className="absolute bottom-0 left-1/2 w-[min(96vw,560px)] max-w-none -translate-x-1/2 select-none drop-shadow-[0_28px_30px_rgba(15,23,42,0.16)] lg:left-[44%] lg:w-[590px]"
            />

            <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden sm:block">
              {INGREDIENTS.map((item, index) => (
                <motion.span
                  key={item.label}
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.7, y: 12 }}
                  whileInView={reduceMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.45 + index * 0.08, type: "spring", stiffness: 170, damping: 16 }}
                  className={`absolute z-20 font-handwriting text-xl font-bold ${item.className}`}
                >
                  {item.label} ↗
                </motion.span>
              ))}
            </div>
          </div>

          <div className="relative order-1 z-20 pb-8 pt-4 lg:order-2 lg:self-center lg:pb-24 lg:pl-6 lg:pt-20">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, x: 18, rotate: -4 }}
              whileInView={reduceMotion ? undefined : { opacity: 1, x: 0, rotate: -2 }}
              viewport={{ once: true }}
              transition={{ delay: 0.16, duration: 0.55 }}
              className="mb-5 inline-flex items-center gap-3 font-handwriting text-xl text-ieee-blue sm:text-2xl"
            >
              <span>okay... don't tell anyone</span>
              <svg aria-hidden="true" viewBox="0 0 90 36" className="h-8 w-20 text-ieee-blue/60">
                <path d="M3 7 C 32 0, 48 30, 82 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M72 14 L83 20 L74 28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </motion.div>

            <h2 id="infinia-teaser-title" className="max-w-[720px] text-[clamp(3.5rem,8vw,7.5rem)] font-black uppercase leading-[0.82] tracking-[-0.065em] text-slate-900">
              <span className="block">We're</span>
              <span className="block text-ieee-blue">cooking</span>
              <span className="block">something.</span>
            </h2>

            <p className="mt-7 max-w-lg text-base font-semibold leading-relaxed text-slate-600 sm:text-lg">
              Something we've made before. Only this time, the recipe looks a little more ambitious.
            </p>

            <div className="relative mt-8 inline-flex items-end gap-3 sm:gap-5">
              <span className="text-[clamp(2.7rem,6vw,5.4rem)] font-black uppercase leading-none tracking-[-0.055em] text-slate-900">
                Infinia
              </span>
              <motion.span
                initial={reduceMotion ? false : { opacity: 0, scale: 0.7, rotate: 8 }}
                whileInView={reduceMotion ? undefined : { opacity: 1, scale: 1, rotate: -7 }}
                viewport={{ once: true }}
                transition={{ delay: 0.62, type: "spring", stiffness: 180, damping: 14 }}
                className="mb-1 font-handwriting text-4xl font-bold text-[#EA4335] sm:text-5xl"
              >
                3.0 ?
              </motion.span>
              <span className="absolute -bottom-8 right-0 rotate-[-5deg] font-handwriting text-lg text-slate-500 sm:-right-20">
                who said that? ↑
              </span>
            </div>

            <div className="mt-16 grid max-w-xl grid-cols-2 gap-x-6 gap-y-5 border-y border-slate-900/10 py-5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-500 sm:grid-cols-4">
              <div>
                <span className="block text-slate-400">Recipe</span>
                <span className="mt-1 block text-slate-800">003</span>
              </div>
              <div>
                <span className="block text-slate-400">Prep time</span>
                <span className="mt-1 block text-slate-800">classified</span>
              </div>
              <div>
                <span className="block text-slate-400">Serves</span>
                <span className="mt-1 block text-slate-800">a lot</span>
              </div>
              <div>
                <span className="block text-slate-400">Status</span>
                <span className="mt-2 flex gap-1" aria-label="Still cooking">
                  {[0, 1, 2, 3, 4].map((segment) => (
                    <span key={segment} className={`h-1.5 w-5 rounded-full ${segment < 3 ? "bg-ieee-blue" : "bg-slate-900/10"}`} />
                  ))}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-30 -mx-5 border-t border-slate-900/10 bg-white/45 px-5 py-7 backdrop-blur-sm sm:-mx-10 sm:px-10 lg:-mx-14 lg:px-14">
          <div className="mb-5 flex items-center gap-3">
            <span className="font-handwriting text-xl text-slate-600">we've been cooking for a while</span>
            <span aria-hidden="true" className="h-px flex-1 bg-slate-900/10" />
          </div>

          <ol className="grid grid-cols-2 gap-5 sm:grid-cols-5 sm:gap-3" aria-label="Flagship event lineage">
            {LEGACY.map(([name, year], index) => (
              <li key={name} className="relative min-w-0 sm:text-center">
                <div className="mb-3 flex items-center sm:justify-center">
                  {index > 0 && <span aria-hidden="true" className="hidden h-px flex-1 bg-slate-300 sm:block" />}
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${index === LEGACY.length - 1 ? "bg-[#EA4335] ring-4 ring-[#EA4335]/10" : "bg-ieee-blue"}`} />
                  {index < LEGACY.length - 1 && <span aria-hidden="true" className="hidden h-px flex-1 bg-slate-300 sm:block" />}
                </div>
                <span className={`block truncate text-xs font-black uppercase tracking-[0.08em] ${index === LEGACY.length - 1 ? "text-[#EA4335]" : "text-slate-800"}`}>
                  {name}
                </span>
                <span className="mt-1 block text-[10px] font-bold tracking-[0.18em] text-slate-400">{year}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </motion.section>
  );
}
