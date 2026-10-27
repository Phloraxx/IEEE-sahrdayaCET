import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { formatDateCompact } from '@/lib/dates';
import type { HomeEventSummary } from '@/server/public/home.server';

interface HeroProps {
    nextEvent?: HomeEventSummary;
    upcomingCount?: number;
    societyCount?: number;
    dataAvailable?: boolean;
}

export const Hero: React.FC<HeroProps> = ({ nextEvent, upcomingCount = 0, societyCount = 0, dataAvailable = true }) => {
    const reduceMotion = Boolean(useReducedMotion());
    const textVariants = {
        hidden: { y: 50, opacity: 0 },
        visible: (i: number) => ({
            y: 0,
            opacity: 1,
            transition: {
                delay: i * 0.1,
                duration: 0.8,
                ease: [0.2, 0.65, 0.3, 0.9] as const,
            },
        }),
    };

    return (
        <section className="relative z-20 flex min-h-[max(72svh,520px)] flex-col items-center justify-center overflow-hidden px-4 py-16 md:min-h-[clamp(600px,60svh,660px)] md:pb-12 md:pt-28">
            <motion.div

                className="relative mx-auto flex w-full max-w-6xl flex-col items-center justify-center gap-10 sm:gap-12 md:gap-10"
            >

                <div className="w-full text-center" data-testid="hero-identity">
                    {/* Main Title Group */}
                    <div className="flex flex-col items-center justify-center gap-2 md:gap-4">
                        <motion.h1
                            custom={0}
                            variants={textVariants}
                            initial={false}
                            animate="visible"
                            className="font-pixel text-5xl sm:text-7xl md:text-8xl lg:text-9xl text-ieee-blue tracking-tighter"
                            style={{ textShadow: '4px 4px 0px rgba(0,0,0,0.1)' }}
                        >
                            IEEE
                        </motion.h1>
                        <motion.h2
                            custom={1}
                            variants={textVariants}
                            initial={false}
                            animate="visible"
                            className="font-pixel text-3xl sm:text-5xl md:text-6xl lg:text-7xl text-gray-900 tracking-tighter"
                            style={{ textShadow: '4px 4px 0px rgba(0,0,0,0.1)' }}
                        >
                            SAHRDAYA
                        </motion.h2>
                    </div>

                    {/* Subtitle / Divider */}
                    <motion.div
                        initial={reduceMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 0.7 }}
                        transition={{ delay: reduceMotion ? 0 : 0.4, duration: reduceMotion ? 0 : 1 }}
                        className="mt-8 flex items-center justify-center gap-4 md:gap-6"
                    >
                        <div className="h-px bg-gray-400 w-12 md:w-32 hidden sm:block" />

                        <div className="flex gap-4 font-sans text-[10px] md:text-xs font-bold tracking-[0.2em] md:tracking-[0.4em] text-gray-600">
                            {["INNOVATE", "CONNECT", "INSPIRE"].map((word, i) => (
                                <motion.span
                                    key={word}
                                    initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: reduceMotion ? 0 : 0.55 + i * 0.15, duration: reduceMotion ? 0 : undefined }}
                                >
                                    {word}.
                                </motion.span>
                            ))}
                        </div>

                        <div className="h-px bg-gray-400 w-12 md:w-32 hidden sm:block" />
                    </motion.div>
                </div>

                {dataAvailable && <motion.div
                    initial={false}
                    animate={{ opacity: 1 }}
                    transition={{ delay: reduceMotion ? 0 : 0.7, duration: reduceMotion ? 0 : 0.8 }}
                    className="mx-auto grid w-full max-w-5xl grid-cols-3 border-y border-gray-200/80 bg-white/55 backdrop-blur-[2px]" data-testid="hero-summary"
                >
                    <div className="px-3 py-3 sm:px-5">
                        <p className="font-mono text-[7px] font-semibold uppercase tracking-[0.16em] text-gray-400 sm:text-[8px]">Next</p>
                        <p className="mt-1 truncate text-[10px] font-semibold text-gray-700 sm:text-xs">{nextEvent ? <><span className="sm:hidden">{formatDateCompact(nextEvent.date)}</span><span className="hidden sm:inline">{formatDateCompact(nextEvent.date)} · {nextEvent.title}</span></> : "No upcoming events"}</p>
                    </div>
                    <div className="border-x border-gray-200/80 px-3 py-3 text-center sm:px-5">
                        <p className="font-mono text-[7px] font-semibold uppercase tracking-[0.16em] text-gray-400 sm:text-[8px]">Upcoming</p>
                        <p className="mt-1 font-pixel text-[11px] text-ieee-blue sm:text-sm">{String(upcomingCount).padStart(2, "0")}</p>
                    </div>
                    <div className="px-3 py-3 text-right sm:px-5">
                        <p className="font-mono text-[7px] font-semibold uppercase tracking-[0.16em] text-gray-400 sm:text-[8px]">Communities</p>
                        <p className="mt-1 font-pixel text-[11px] text-gray-800 sm:text-sm">{String(societyCount).padStart(2, "0")}</p>
                    </div>
                </motion.div>}
            </motion.div>
        </section>
    );
};
