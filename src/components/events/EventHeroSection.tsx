'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { FADE_UP, STAGGER } from './animations';

export function EventHeroSection() {
    return (
        <section className="relative pt-48 pb-16 px-4 max-w-[1400px] mx-auto">
            <div className="text-center max-w-[900px] mx-auto relative z-10 mb-24">
                <motion.h1
                    variants={STAGGER}
                    initial="hidden"
                    animate="show"
                    className="text-[3.5rem] md:text-[5rem] lg:text-[6rem] font-black leading-[1.1] tracking-tight text-slate-800"
                >
                    <motion.div variants={FADE_UP}>Experience the</motion.div>
                    <motion.div variants={FADE_UP} className="flex items-center justify-center gap-4 flex-wrap">
                        <span className="text-[#00629B] relative inline-block">
                            Extraordinary
                            <svg className="absolute w-[110%] h-6 -bottom-2 -left-[5%] text-[#00629B]/20" viewBox="0 0 200 20" preserveAspectRatio="none">
                                <path d="M 5,15 Q 50,0 100,10 T 195,15" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
                            </svg>
                        </span>
                    </motion.div>
                </motion.h1>

                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="mt-8 text-lg md:text-xl text-slate-500 font-medium max-w-2xl mx-auto"
                >
                    Join the brightest minds at IEEE Sahrdaya SB. Explore our upcoming workshops, hackathons, and symposiums designed to elevate your skills.
                </motion.p>
            </div>

            {/* Marquee */}
            <div className="w-full overflow-hidden py-10 mb-16 relative flex">
                <div className="absolute left-0 top-0 bottom-0 w-12 md:w-48 bg-gradient-to-r from-[#F8F9FA] to-transparent z-10 pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-12 md:w-48 bg-gradient-to-l from-[#F8F9FA] to-transparent z-10 pointer-events-none" />
                <div className="flex w-max animate-marquee">
                    {[1, 2].map((i) => (
                        <div key={i} className="flex shrink-0 px-4 items-center gap-6 md:gap-12">
                            <span className="text-4xl md:text-6xl font-black text-slate-200 tracking-tight uppercase whitespace-nowrap">Think Different</span>
                            <span className="text-[#00629B]/30 text-3xl md:text-5xl shrink-0">✦</span>
                            <span className="text-4xl md:text-6xl font-black text-slate-200 tracking-tight uppercase whitespace-nowrap">Code Better</span>
                            <span className="text-[#00629B]/30 text-3xl md:text-5xl shrink-0">✦</span>
                            <span className="text-4xl md:text-6xl font-black text-slate-200 tracking-tight uppercase whitespace-nowrap">Build Faster</span>
                            <span className="text-[#00629B]/30 text-3xl md:text-5xl shrink-0">✦</span>
                            <span className="text-4xl md:text-6xl font-black text-slate-200 tracking-tight uppercase whitespace-nowrap">Design Smarter</span>
                            <span className="text-[#00629B]/30 text-3xl md:text-5xl shrink-0">✦</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
