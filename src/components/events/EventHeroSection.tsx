import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownRight } from "lucide-react";

export function EventHeroSection() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="event-editorial-shell relative overflow-hidden px-5 pb-16 pt-36 sm:px-8 md:pb-24 md:pt-44 lg:px-12">
      <div className="mx-auto max-w-[1440px]">
        <div className="flex items-end justify-between border-b border-black/10 pb-5 text-[10px] font-semibold uppercase tracking-[0.22em] text-black/45 sm:text-xs">
          <span>IEEE Sahrdaya Student Branch</span>
          <span className="hidden sm:inline">Events / 2026</span>
        </div>

        <div className="relative pt-8 md:pt-10">
          <h1 className="sr-only">Events at IEEE Sahrdaya Student Branch</h1>
          <div aria-hidden="true" className="overflow-hidden">
            <motion.div
              initial={reduceMotion ? false : { y: "105%" }}
              animate={{ y: 0 }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              className="event-display-title select-none text-[21vw] font-semibold uppercase leading-[0.72] tracking-[-0.075em] text-[#111315] sm:text-[18vw] lg:text-[15.2rem]"
            >
              Events
            </motion.div>
          </div>

          <div className="mt-10 grid gap-8 md:mt-14 md:grid-cols-12 md:items-end">
            <motion.p
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.65 }}
              className="max-w-xl text-lg leading-relaxed text-black/60 md:col-span-5 md:text-xl"
            >
              Workshops, talks, competitions and experiences built for people who want to make, learn and meet what comes next.
            </motion.p>

            <motion.a
              href="#upcoming-events"
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.48, duration: 0.65 }}
              className="group inline-flex items-center gap-3 justify-self-start text-xs font-bold uppercase tracking-[0.18em] text-[#111315] md:col-start-11 md:col-span-2 md:justify-self-end"
            >
              Explore
              <span className="grid h-10 w-10 place-items-center rounded-full border border-black/15 transition duration-300 group-hover:border-[#00629B] group-hover:bg-[#00629B] group-hover:text-white">
                <ArrowDownRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:translate-y-0.5" />
              </span>
            </motion.a>
          </div>
        </div>
      </div>
    </section>
  );
}
