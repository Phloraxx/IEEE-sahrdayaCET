import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { StarsBackground } from "@/components/ui/stars-background";
import { ShootingStars } from "@/components/ui/shooting-stars";
import { TechnicalDetails } from "@/components/TechnicalDetails";
import type { Society } from "@/types";

interface SocietiesClientProps {
  societies: Society[];
}

export default function SocietiesClient({ societies }: SocietiesClientProps) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="relative min-h-screen w-full bg-white font-sans text-gray-900">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 h-dvh overflow-hidden"
      >
        <StarsBackground
          starDensity={0.0004}
          allStarsTwinkle
          starColor="#1e293b"
        />
        <ShootingStars
          starColor="#00629b"
          trailColor="#0099D6"
          minDelay={1500}
          maxDelay={4000}
          minSpeed={8}
          maxSpeed={20}
          starWidth={12}
          starHeight={2}
        />
        <ShootingStars
          starColor="#00629b"
          trailColor="#0099D6"
          minDelay={2000}
          maxDelay={5000}
          minSpeed={12}
          maxSpeed={25}
          starWidth={10}
          starHeight={1}
        />
        <ShootingStars
          starColor="#0099D6"
          trailColor="#00629b"
          minDelay={3000}
          maxDelay={6000}
          minSpeed={10}
          maxSpeed={22}
          starWidth={8}
          starHeight={1}
        />
        <div className="relative z-10 h-full">
          <TechnicalDetails />
        </div>
      </div>

      <Navbar />

      <main className="relative z-10 px-6 pb-20 pt-32">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            className="mb-16 text-center"
          >
            <h1
              className="mb-4 font-pixel text-4xl text-ieee-blue md:text-6xl lg:text-7xl"
              style={{ textShadow: "4px 4px 0px rgba(0,0,0,0.1)" }}
            >
              SELECT YOUR SOCIETY
            </h1>
            <div className="mt-8 flex items-center justify-center gap-6">
              <div className="hidden h-px w-32 bg-gray-400 sm:block" />
              <p className="text-xs font-bold tracking-[0.4em] text-gray-600">
                CHOOSE YOUR PATH
              </p>
              <div className="hidden h-px w-32 bg-gray-400 sm:block" />
            </div>
          </motion.div>

          {societies.length === 0 ? (
            <p className="py-12 text-center text-gray-500">
              No societies found.
            </p>
          ) : (
            <motion.div
              className="flex flex-wrap justify-center gap-4 md:gap-6"
              initial={reduceMotion ? false : "hidden"}
              animate="visible"
              variants={{
                hidden: {},
                visible: {
                  transition: { staggerChildren: reduceMotion ? 0 : 0.055 },
                },
              }}
            >
              {societies.map((society) => (
                <motion.div
                  key={society.id}
                  variants={{
                    hidden: {
                      opacity: 0,
                      scale: reduceMotion ? 1 : 0.96,
                      y: reduceMotion ? 0 : 18,
                    },
                    visible: {
                      opacity: 1,
                      scale: 1,
                      y: 0,
                      transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
                    },
                  }}
                  whileHover={
                    reduceMotion
                      ? undefined
                      : { y: -5, transition: { duration: 0.2 } }
                  }
                  whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                  className="group relative w-[calc(50%-0.5rem)] min-w-0 md:w-[calc(33.333%-1rem)] lg:w-[calc(25%-1.125rem)] xl:w-[calc(20%-1.2rem)]"
                >
                  <Link
                    to={`/societies/${society.slug.toLowerCase()}`}
                    className="block cursor-pointer text-left"
                    aria-label={`View ${society.name}`}
                  >
                    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_38px_rgba(15,23,42,0.09)] transition duration-300 group-hover:border-ieee-blue/45 group-hover:shadow-[0_22px_50px_rgba(0,98,155,0.13)]">
                      <div className="absolute inset-0 z-0 bg-linear-to-br from-ieee-blue/0 to-ieee-light-blue/0 transition duration-300 group-hover:from-ieee-blue/[0.055] group-hover:to-ieee-light-blue/[0.035]" />
                      <div className="relative flex aspect-square items-center justify-center p-4 sm:p-6">
                        <div className="relative flex h-full w-full items-center justify-center rounded-xl border border-slate-100/80 bg-white/70 p-3 sm:p-4">
                          {society.logoUrl ? (
                            <img
                              src={society.logoUrl}
                              alt={`${society.name} logo`}
                              className="max-h-[76%] max-w-[86%] object-contain drop-shadow-md transition duration-300 group-hover:scale-[1.025]"
                            />
                          ) : (
                            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-gray-100">
                              <span className="text-2xl font-bold text-gray-400">
                                {society.name.charAt(0)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="relative flex min-h-[4.75rem] items-center justify-center border-t border-slate-100 bg-white/85 px-3 py-4 sm:min-h-[5rem] sm:px-4">
                        <h2 className="text-center text-[10px] font-extrabold leading-[1.35] text-slate-800 transition-colors group-hover:text-ieee-blue sm:text-xs md:text-sm">
                          {society.name}
                        </h2>
                      </div>
                      <span className="absolute left-3 top-3 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-slate-400">
                        IEEE / {society.slug.toUpperCase()}
                      </span>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
