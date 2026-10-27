import React from 'react';
import { Link } from 'react-router';
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
        <section className="relative h-[max(78svh,560px)] flex flex-col items-center justify-center z-20 px-4 overflow-hidden md:h-[max(84svh,640px)]">
            <motion.div

                className="w-full h-full flex flex-col items-center justify-center relative"
            >

                <div className="text-center transform translate-y-[-10%]">
                    {/* Main Title Group */}
                    <div className="flex flex-col items-center justify-center gap-2 md:gap-4 mb-8">
                        <motion.h1
                            custom={0}
                            variants={textVariants}
                            initial={false}
                            animate="visible"
                            className="font-pixel text-5xl sm:text-7xl md:text-8xl lg:text-9xl text-white tracking-tighter"
                            style={{ textShadow: '0 4px 26px rgba(7, 30, 48, .32)' }}
                        >
                            IEEE
                        </motion.h1>
                        <motion.h2
                            custom={1}
                            variants={textVariants}
                            initial={false}
                            animate="visible"
                            className="font-pixel text-3xl sm:text-5xl md:text-6xl lg:text-7xl text-[#eef8ff] tracking-tighter"
                            style={{ textShadow: '0 4px 26px rgba(7, 30, 48, .32)' }}
                        >
                            SAHRDAYA
                        </motion.h2>
                    </div>

                    {/* Subtitle / Divider */}
                    <motion.div
                        initial={reduceMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 0.7 }}
                        transition={{ delay: reduceMotion ? 0 : 0.4, duration: reduceMotion ? 0 : 1 }}
                        className="flex items-center justify-center gap-4 md:gap-6 mt-8 md:mt-12"
                    >
                        <div className="h-px bg-white/55 w-12 md:w-32 hidden sm:block" />

                        <div className="flex gap-4 font-sans text-[10px] md:text-xs font-bold tracking-[0.2em] md:tracking-[0.4em] text-white/85">
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

                        <div className="h-px bg-white/55 w-12 md:w-32 hidden sm:block" />
                    </motion.div>
                    <p className="mx-auto mt-6 max-w-md text-sm leading-6 text-white/85 sm:text-base">Build, learn and connect with the IEEE student community at Sahrdaya.</p>
                    <div className="mt-5 flex flex-wrap justify-center gap-3">
                      <Link to="/events" className="inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-[#174d72] shadow-sm hover:bg-[#e8f5ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Explore events</Link>
                      <Link to="/societies" className="inline-flex min-h-11 items-center rounded-full border border-white/50 bg-white/10 px-5 text-sm font-semibold text-white backdrop-blur-sm hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Meet our communities</Link>
                    </div>
                </div>

                {dataAvailable && <motion.div
                    initial={false}
                    animate={{ opacity: 1 }}
                    transition={{ delay: reduceMotion ? 0 : 0.7, duration: reduceMotion ? 0 : 0.8 }}
                    className="absolute bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] left-4 right-4 mx-auto grid max-w-5xl grid-cols-3 border-y border-white/30 bg-[#12364d]/40 text-white backdrop-blur-md md:bottom-14"
                >
                    <div className="px-3 py-3 sm:px-5">
                        <p className="font-mono text-[7px] font-semibold uppercase tracking-[0.16em] text-white/65 sm:text-[8px]">Next</p>
                        <p className="mt-1 truncate text-[10px] font-semibold text-white/95 sm:text-xs">{nextEvent ? <><span className="sm:hidden">{formatDateCompact(nextEvent.date)}</span><span className="hidden sm:inline">{formatDateCompact(nextEvent.date)} · {nextEvent.title}</span></> : "No upcoming events"}</p>
                    </div>
                    <div className="border-x border-white/25 px-3 py-3 text-center sm:px-5">
                        <p className="font-mono text-[7px] font-semibold uppercase tracking-[0.16em] text-white/65 sm:text-[8px]">Upcoming</p>
                        <p className="mt-1 font-pixel text-[11px] text-[#c7eaff] sm:text-sm">{String(upcomingCount).padStart(2, "0")}</p>
                    </div>
                    <div className="px-3 py-3 text-right sm:px-5">
                        <p className="font-mono text-[7px] font-semibold uppercase tracking-[0.16em] text-white/65 sm:text-[8px]">Communities</p>
                        <p className="mt-1 font-pixel text-[11px] text-white sm:text-sm">{String(societyCount).padStart(2, "0")}</p>
                    </div>
                </motion.div>}
            </motion.div>
        </section>
    );
};
