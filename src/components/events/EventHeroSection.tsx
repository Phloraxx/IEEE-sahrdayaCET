import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown } from "lucide-react";

interface EventHeroSectionProps {
  upcomingCount: number;
  totalCount: number;
}

export function EventHeroSection({ upcomingCount, totalCount }: EventHeroSectionProps) {
  const reduceMotion = useReducedMotion();
  const year = new Date().getFullYear();

  return (
    <section className="event-programme-hero relative overflow-hidden bg-[#0b0d0f] px-5 pb-10 pt-32 text-[#f5f2eb] sm:px-8 md:pb-14 md:pt-40 lg:px-12">
      <div className="event-programme-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
      <motion.div
        aria-hidden="true"
        initial={reduceMotion ? false : { scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        className="absolute right-[9%] top-0 hidden h-36 w-px origin-top bg-[#00a4e4] md:block"
      />

      <div className="relative mx-auto max-w-[1440px]">
        <div className="flex items-center justify-between border-b border-white/15 pb-5 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50 sm:text-xs">
          <span>IEEE Sahrdaya</span>
          <span>Programme / {year}</span>
        </div>
        <div className="grid min-h-[500px] gap-12 py-14 md:min-h-[570px] md:grid-cols-12 md:items-end md:py-20">
          <div className="md:col-span-8">
            <p className="mb-5 text-[10px] font-bold uppercase tracking-[0.24em] text-[#00a4e4] sm:text-xs">
              What&apos;s on
            </p>
            <h1 className="sr-only">Events at IEEE Sahrdaya Student Branch</h1>
            <div aria-hidden="true" className="overflow-hidden">
              <motion.div
                initial={reduceMotion ? false : { y: "110%" }}
                animate={{ y: 0 }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                className="max-w-5xl text-[18vw] font-semibold uppercase leading-[0.78] tracking-[-0.075em] sm:text-[15vw] md:text-[9.7rem] lg:text-[11.5rem]"
              >
                Events
              </motion.div>
            </div>
          </div>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32, duration: 0.7 }}
            className="md:col-span-4 md:pb-2"
          >
            <p className="max-w-md text-lg leading-relaxed text-white/62 md:text-xl">
              Workshops, competitions and conversations for people who would rather build something than just watch it happen.
            </p>
            <div className="mt-10 grid grid-cols-2 gap-3 border-t border-white/15 pt-5">
              <div>
                <div className="text-3xl font-semibold tracking-[-0.05em] tabular-nums sm:text-4xl">
                  {String(upcomingCount).padStart(2, "0")}
                </div>
                <div className="mt-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/40">Upcoming</div>
              </div>
              <div>
                <div className="text-3xl font-semibold tracking-[-0.05em] tabular-nums sm:text-4xl">
                  {String(totalCount).padStart(2, "0")}
                </div>
                <div className="mt-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/40">In the programme</div>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="flex items-center justify-between border-t border-white/15 pt-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">
          <span>Kodakara / Thrissur</span>
          <a href="#upcoming-events" className="group inline-flex items-center gap-3 text-white/70 transition hover:text-white">
            Browse programme
            <span className="grid h-9 w-9 place-items-center rounded-full border border-white/20 transition group-hover:border-[#00a4e4] group-hover:bg-[#00a4e4] group-hover:text-[#0b0d0f]">
              <ArrowDown className="h-4 w-4" />
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
