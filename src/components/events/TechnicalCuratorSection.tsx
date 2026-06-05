'use client';

import React, { useRef } from 'react';
import { motion, Variants, useInView } from 'framer-motion';
import { QrCode, Users, Layout, Terminal, Share2, CheckCircle, ArrowRight, BarChart3, Zap, TrendingUp } from 'lucide-react';
import { FADE_UP } from './animations';

const SCALE_IN: Variants = {
    hidden: { opacity: 0, scale: 0.95 },
    show: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 100, damping: 20 } },
};

const BENTO_STAGGER: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
};

export function TechnicalCuratorSection() {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: '-100px' });

    return (
        <motion.section
            ref={ref}
            initial="hidden"
            animate={isInView ? 'show' : 'hidden'}
            variants={FADE_UP}
            className="py-20 sm:py-32 px-6 bg-white"
        >
            <div className="max-w-7xl mx-auto relative">
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.8, type: "spring", bounce: 0.5 }}
                    className="absolute -top-8 lg:-top-12 right-4 lg:right-20 z-20 pointer-events-none scale-75 lg:scale-100 origin-right"
                >
                    <span className="font-handwriting text-2xl text-[#FBBC05] bg-white/80 backdrop-blur-sm px-4 py-2 rounded-full shadow-sm border border-slate-100 rotate-[12deg] inline-block">
                        Supercharged! 🔋
                    </span>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="mb-12 sm:mb-16"
                >
                    <h2 className="font-sans font-bold text-3xl sm:text-4xl md:text-5xl mb-4">
                        Technical <span className="text-[#006855]">Curator</span> OS
                    </h2>
                    <p className="text-slate-500 font-sans text-base sm:text-lg">
                        Next-generation event management for the modern engineer.
                    </p>
                </motion.div>

                <motion.div
                    variants={BENTO_STAGGER}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true }}
                    className="grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-auto md:h-auto"
                >
                    {/* Card 1: Instant Check-in */}
                    <motion.div
                        variants={SCALE_IN}
                        whileHover={{ y: -5 }}
                        transition={{ duration: 0.3 }}
                        className="md:col-span-8 bg-slate-50 rounded-3xl p-8 sm:p-10 flex flex-col justify-between overflow-hidden relative group min-h-[400px]"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.7, type: "spring", bounce: 0.5 }}
                            className="absolute top-4 md:top-6 right-2 md:right-6 z-20 pointer-events-none scale-75 md:scale-100 origin-top-right"
                        >
                            <span className="font-handwriting text-xl text-[#EA4335] bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm border border-slate-100 rotate-[10deg] inline-block">
                                Lightning fast! ⚡️
                            </span>
                        </motion.div>
                        <div className="relative z-10">
                            <QrCode className="text-[#00629B] w-12 h-12 mb-6" strokeWidth={1.5} />
                            <h3 className="font-sans font-bold text-2xl sm:text-3xl mb-4">Instant Event Check-in</h3>
                            <p className="text-slate-500 max-w-sm leading-relaxed">
                                No more queues. Our lightning-fast QR system processes entries in under 0.5 seconds, integrated directly with your IEEE global ID.
                            </p>
                        </div>
                        <div className="absolute bottom-0 right-0 translate-y-12 translate-x-12 opacity-5 group-hover:scale-110 transition-transform duration-700">
                            <QrCode className="w-60 h-60" />
                        </div>
                        <div className="mt-8">
                            <button className="text-[#00629B] font-bold font-sans flex items-center gap-2 group/btn hover:gap-3 transition-all">
                                Learn about Check-in
                                <ArrowRight className="w-5 h-5 transition-transform" />
                            </button>
                        </div>
                    </motion.div>

                    {/* Card 2: Networking Games */}
                    <motion.div
                        variants={SCALE_IN}
                        whileHover={{ y: -5 }}
                        transition={{ duration: 0.3 }}
                        className="md:col-span-4 bg-[#72f9d8] rounded-3xl p-8 sm:p-10 flex flex-col justify-between text-[#005d4c] min-h-[400px] relative overflow-hidden"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.9, type: "spring", bounce: 0.5 }}
                            className="absolute bottom-24 md:bottom-32 right-2 md:right-6 z-20 pointer-events-none scale-75 md:scale-100 origin-bottom-right"
                        >
                            <span className="font-handwriting text-xl text-[#006855] bg-white/50 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm border border-[#72f9d8] rotate-[-15deg] inline-block">
                                Make friends! 🤝
                            </span>
                        </motion.div>
                        <div className="relative z-10">
                            <Users className="w-10 h-10 mb-6" strokeWidth={1.5} />
                            <h3 className="font-sans font-bold text-xl sm:text-2xl mb-4">Networking Games</h3>
                            <p className="opacity-90">
                                AI-powered icebreakers that match you with peers based on your technical interests.
                            </p>
                        </div>
                        <div className="mt-8 flex -space-x-3 overflow-hidden">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="inline-block h-12 w-12 rounded-full bg-[#006855] ring-4 ring-[#72f9d8]" />
                            ))}
                            <div className="h-12 w-12 rounded-full bg-[#006855] flex items-center justify-center text-white text-xs font-bold ring-4 ring-[#72f9d8]">
                                +82
                            </div>
                        </div>
                    </motion.div>

                    {/* Card 3: Event OS */}
                    <motion.div
                        variants={SCALE_IN}
                        whileHover={{ y: -5 }}
                        transition={{ duration: 0.3 }}
                        className="md:col-span-4 bg-[#00629B] text-white rounded-3xl p-8 sm:p-10 flex flex-col justify-between min-h-[350px]"
                    >
                        <div>
                            <Layout className="w-10 h-10 mb-6" strokeWidth={1.5} />
                            <h3 className="font-sans font-bold text-xl sm:text-2xl mb-4">Event OS</h3>
                            <p className="text-white/80">
                                Manage registrations, certificates, and feedback in a single unified dashboard.
                            </p>
                        </div>
                        <button className="mt-6 w-full py-4 bg-white text-[#00629B] rounded-full font-sans font-bold hover:bg-[#ecf3ff] transition-colors">
                            Open Dashboard
                        </button>
                    </motion.div>

                    {/* Card 4: Seamless Integrations */}
                    <motion.div
                        variants={SCALE_IN}
                        whileHover={{ y: -5 }}
                        transition={{ duration: 0.3 }}
                        className="md:col-span-8 bg-[#ebf1ff] rounded-3xl p-8 sm:p-10 flex flex-col md:flex-row items-start md:items-center gap-6 sm:gap-10 min-h-[350px]"
                    >
                        <div className="flex-1">
                            <h3 className="font-sans font-bold text-xl sm:text-2xl mb-3">Seamless Integrations</h3>
                            <p className="text-slate-500">
                                Connect your workshops with GitHub, LinkedIn, and IEEE Xplore for instant credentialing.
                            </p>
                        </div>
                        <div className="flex gap-4">
                            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm hover:shadow-md transition-shadow">
                                <Terminal className="w-7 h-7 text-slate-700" />
                            </div>
                            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm hover:shadow-md transition-shadow">
                                <Share2 className="w-7 h-7 text-slate-700" />
                            </div>
                            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm hover:shadow-md transition-shadow">
                                <CheckCircle className="w-7 h-7 text-slate-700" />
                            </div>
                        </div>
                    </motion.div>

                    {/* Card 5: Live Event Analytics */}
                    <motion.div
                        variants={SCALE_IN}
                        whileHover={{ y: -5, scale: 1.02 }}
                        transition={{ duration: 0.3 }}
                        className="md:col-span-6 bg-gradient-to-br from-[#006855] to-[#004d3d] text-white rounded-3xl p-8 sm:p-10 flex flex-col justify-between overflow-hidden relative group min-h-[380px]"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.8, type: "spring", bounce: 0.5 }}
                            className="absolute top-4 md:top-8 right-2 md:right-8 z-20 pointer-events-none scale-75 md:scale-100 origin-top-right"
                        >
                            <span className="font-handwriting text-xl text-[#72f9d8] bg-[#004d3d]/80 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm border border-[#006855] rotate-[8deg] inline-block">
                                Data is beautiful 📊
                            </span>
                        </motion.div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
                                    <BarChart3 className="w-8 h-8" strokeWidth={1.5} />
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-[#72f9d8]/20 rounded-full">
                                    <Zap className="w-4 h-4 text-[#72f9d8]" />
                                    <span className="text-xs font-semibold text-[#72f9d8] uppercase tracking-wide">Live</span>
                                </div>
                            </div>
                            <h3 className="font-sans font-bold text-2xl sm:text-3xl mb-4">Live Event Analytics</h3>
                            <p className="text-white/80 max-w-sm leading-relaxed mb-6">
                                Real-time insights into attendee engagement, session popularity, and participation metrics—all at your fingertips.
                            </p>
                            <div className="flex items-center gap-4 mb-6">
                                <div className="flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5 text-[#72f9d8]" />
                                    <span className="text-sm font-medium">98% accuracy</span>
                                </div>
                                <div className="w-px h-4 bg-white/30" />
                                <span className="text-sm text-white/70">Updated every 5s</span>
                            </div>
                        </div>

                        <div className="flex items-end gap-2 h-20 mt-auto">
                            {[40, 65, 45, 80, 55, 90, 70, 85].map((height, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ height: 0 }}
                                    whileInView={{ height: `${height}%` }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.5, delay: i * 0.1 }}
                                    className="flex-1 bg-[#72f9d8]/60 rounded-t-lg group-hover:bg-[#72f9d8] transition-colors duration-300"
                                />
                            ))}
                        </div>

                        <div className="absolute -top-20 -right-20 w-40 h-40 bg-[#72f9d8]/20 rounded-full blur-3xl pointer-events-none group-hover:bg-[#72f9d8]/30 transition-colors duration-500" />
                    </motion.div>

                    {/* Card 6: Smart Event Scheduler */}
                    <motion.div
                        variants={SCALE_IN}
                        whileHover={{ y: -5 }}
                        transition={{ duration: 0.3 }}
                        className="md:col-span-6 bg-white rounded-3xl p-8 sm:p-10 flex flex-col justify-between border border-[#ebf1ff] min-h-[380px]"
                    >
                        <div>
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#ebf1ff] rounded-full mb-6">
                                <span className="w-2 h-2 rounded-full bg-[#00629B] animate-pulse" />
                                <span className="text-xs font-semibold text-[#00629B] uppercase tracking-wide">New Feature</span>
                            </div>
                            <h3 className="font-sans font-bold text-xl sm:text-2xl mb-4 text-[#152f50]">Smart Event Scheduler</h3>
                            <p className="text-slate-500 leading-relaxed mb-6">
                                AI-powered scheduling that automatically finds the best time slots based on attendee availability and venue resources.
                            </p>
                            <ul className="space-y-3">
                                {['Conflict-free scheduling', 'Room optimization', 'Attendee preferences'].map((feature, i) => (
                                    <li key={i} className="flex items-center gap-3 text-slate-500">
                                        <div className="w-5 h-5 rounded-full bg-[#72f9d8]/30 flex items-center justify-center">
                                            <CheckCircle className="w-3 h-3 text-[#006855]" />
                                        </div>
                                        <span className="text-sm font-medium">{feature}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <button className="mt-8 w-full py-4 bg-[#00629B] text-white rounded-full font-sans font-bold hover:bg-[#004d73] transition-colors flex items-center justify-center gap-2 group">
                            Try Smart Scheduler
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </motion.div>
                </motion.div>
            </div>
        </motion.section>
    );
}
