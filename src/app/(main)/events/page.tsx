'use client';

import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence, Variants, useInView } from 'framer-motion';
import {
    Sparkles, QrCode, Users, Layout, Terminal, Share2, CheckCircle,
    CalendarDays, ChevronRight, MapPin, X, Ticket, ArrowRight,
    BarChart3, Zap, TrendingUp
} from 'lucide-react';
import Image from 'next/image';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const EventRegistrationModal = dynamic(
    () => import('@/components/EventRegistrationModal'),
    { ssr: false, loading: () => null }
);

const MyTicketsSection = dynamic(
    () => import('@/components/tickets/MyTicketsSection').then((mod) => mod.MyTicketsSection),
    { ssr: false, loading: () => null }
);

// ==================== TYPES ====================
interface EventWithSociety {
    $id: string;
    $createdAt: string;
    $updatedAt: string;
    title: string;
    description?: string;
    date: string;
    venue?: string;
    price: number;
    banner_url?: string;
    society_id?: string;
    status: string;
    registration_open?: boolean;
    max_capacity?: number;
    society?: {
        $id: string;
        name: string;
        logo_url?: string;
    };
}

interface AgendaItem {
    time: string;
    title: string;
}

interface ExtendedEvent extends EventWithSociety {
    about?: string;
    agenda?: AgendaItem[];
    tags?: string[];
    color?: string;
    textColor?: string;
}

// ==================== ANIMATION VARIANTS ====================
const FADE_UP: Variants = {
    hidden: { opacity: 0, y: 40 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 60, damping: 15 } },
};

const STAGGER: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const SCALE_IN: Variants = {
    hidden: { opacity: 0, scale: 0.95 },
    show: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 100, damping: 20 } },
};

const BENTO_STAGGER: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
};

// ==================== ANIMATED SECTION COMPONENT ====================
interface AnimatedSectionProps {
    children: React.ReactNode;
    className?: string;
}

const AnimatedSection: React.FC<AnimatedSectionProps> = ({ children, className = '' }) => {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: '-100px' });

    return (
        <motion.section
            ref={ref}
            initial="hidden"
            animate={isInView ? 'show' : 'hidden'}
            variants={FADE_UP}
            className={className}
        >
            {children}
        </motion.section>
    );
};

const getEventColor = (index: number): { color: string; textColor: string } => {
    const colors = [
        { color: 'bg-[#4285F4]', textColor: 'text-[#4285F4]' },
        { color: 'bg-[#34A853]', textColor: 'text-[#34A853]' },
        { color: 'bg-[#EA4335]', textColor: 'text-[#EA4335]' },
        { color: 'bg-[#FBBC05]', textColor: 'text-[#FBBC05]' },
        { color: 'bg-[#00629B]', textColor: 'text-[#00629B]' },
    ];
    return colors[index % colors.length];
};

// ==================== MAIN PAGE COMPONENT ====================
export default function Events1Page() {
    const [events, setEvents] = useState<EventWithSociety[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedEvent, setSelectedEvent] = useState<ExtendedEvent | null>(null);
    const [registrationEvent, setRegistrationEvent] = useState<EventWithSociety | null>(null);
    const [isRegistrationModalOpen, setIsRegistrationModalOpen] = useState(false);

    // Fetch events from API
    const fetchEvents = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const now = new Date().toISOString();
            const response = await fetch(`/api/events?where[status][equals]=published&where[date][greater_than]=${now}&sort=date&limit=20`);
            
            if (!response.ok) throw new Error('Failed to fetch events');
            
            const data = await response.json();
                const eventsList: EventWithSociety[] = (data.docs || data.events || []).map((doc: Record<string, unknown>) => {
                    const societyRaw = doc.society;
                    const society_id = typeof societyRaw === 'object' && societyRaw !== null
                        ? ((societyRaw as { id?: string }).id || '') as string
                        : (societyRaw as string) || '';
                    return {
                        $id: (doc.id || doc.$id) as string,
                        $createdAt: (doc.createdAt || doc.$createdAt || '') as string,
                        $updatedAt: (doc.updatedAt || doc.$updatedAt || '') as string,
                        title: doc.title as string,
                        description: doc.description as string,
                        date: doc.date as string,
                        venue: doc.venue as string,
                        price: (doc.price as number) || 0,
                        banner_url: doc.banner_url as string,
                        society_id,
                        status: (doc.status as string) || 'published',
                        registration_open: doc.registration_open as boolean,
                        max_capacity: doc.max_capacity as number,
                        society: undefined,
                    };
                });

            setEvents(eventsList);
        } catch (err) {
            console.error('Failed to fetch events:', err);
            setError('Unable to load events right now. Please try again in a moment.');
            setEvents([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    // Lock body scroll when modal is open
    useEffect(() => {
        if (selectedEvent) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [selectedEvent]);

    // Extended events with display properties
    const extendedEvents: ExtendedEvent[] = useMemo(() => {
        return events.map((event, index) => ({
            ...event,
            about: event.description || 'Join us for this exciting IEEE event!',
            agenda: [
                { time: '10:00 AM', title: 'Registration & Welcome' },
                { time: '11:00 AM', title: 'Main Session' },
                { time: '01:00 PM', title: 'Networking' }
            ],
            tags: [event.society?.name || 'IEEE Event'],
            ...getEventColor(index),
        }));
    }, [events]);

    return (
        <main className="min-h-screen text-slate-800 font-sans selection:bg-[#00629B] selection:text-white overflow-x-hidden relative bg-[#F8F9FA]">
            {/* Custom Styles */}
            <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&display=swap');
                .font-handwriting { font-family: 'Caveat', cursive; }
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
                @keyframes marquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
                .animate-marquee { animation: marquee 25s linear infinite; }
            `}</style>

            {/* Background Noise Texture */}
            <div
                className="fixed inset-0 pointer-events-none opacity-[0.02] z-50 mix-blend-overlay"
                style={{
                    backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")'
                }}
            />

            <Navbar />

            {/* ==================== HERO SECTION ==================== */}
            <section className="relative pt-48 pb-16 px-4 max-w-[1400px] mx-auto">
                <div className="text-center max-w-[900px] mx-auto relative z-10 mb-24">
                    {/* Staggered Headline */}
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
                                {/* Wavy Underline SVG */}
                                <svg className="absolute w-[110%] h-6 -bottom-2 -left-[5%] text-[#00629B]/20" viewBox="0 0 200 20" preserveAspectRatio="none">
                                    <path d="M 5,15 Q 50,0 100,10 T 195,15" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
                                </svg>
                            </span>
                        </motion.div>
                    </motion.h1>

                    {/* Subtitle */}
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                        className="mt-8 text-lg md:text-xl text-slate-500 font-medium max-w-2xl mx-auto"
                    >
                        Join the brightest minds at IEEE Sahrdaya SB. Explore our upcoming workshops, hackathons, and symposiums designed to elevate your skills.
                    </motion.p>
                </div>

                {/* ==================== MARQUEE SECTION ==================== */}
                <div className="w-full overflow-hidden py-10 mb-16 relative flex">
                    <div className="absolute left-0 top-0 bottom-0 w-12 md:w-48 bg-gradient-to-r from-[#F8F9FA] to-transparent z-10 pointer-events-none"></div>
                    <div className="absolute right-0 top-0 bottom-0 w-12 md:w-48 bg-gradient-to-l from-[#F8F9FA] to-transparent z-10 pointer-events-none"></div>
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

                {/* ==================== UPCOMING EVENTS SECTION ==================== */}
                <div className="max-w-[1100px] mx-auto relative mt-8" id="events-section">
                    {/* Section Title */}
                    <div className="flex items-center justify-between mb-16 px-4">
                        <h2 className="text-4xl font-black tracking-tight text-slate-800 flex items-center gap-4">
                            Upcoming Events
                            <span className="bg-[#EA4335]/10 text-[#EA4335] text-sm px-4 py-1.5 rounded-full font-bold tracking-wide align-middle">
                                {loading ? '...' : extendedEvents.length}
                            </span>
                        </h2>
                    </div>

                    {/* Fun Annotations for Upcoming Events Header */}
                    {!loading && (
                        <div className="hidden sm:block absolute top-12 left-1/2 -translate-x-1/2 z-20 pointer-events-none origin-center">
                            <motion.div
                                initial={{ opacity: 0, y: 10, rotate: -10 }}
                                whileInView={{ opacity: 1, y: 0, rotate: -5 }}
                                viewport={{ once: true }}
                                transition={{ delay: 0.5, type: "spring" }}
                                className="relative"
                            >
                                <span className={`font-handwriting text-2xl absolute -top-8 -left-24 whitespace-nowrap rotate-[-10deg] ${extendedEvents.length === 0 ? 'text-[#EA4335]' :
                                    extendedEvents.length === 1 ? 'text-[#34A853]' :
                                        'text-[#FBBC05]'
                                    }`}>
                                    {extendedEvents.length === 0 ? "Cooking things up! 🍳" :
                                        extendedEvents.length === 1 ? "Don't miss out! 🏃‍♂️" :
                                            "Tough choice! 👀"}
                                </span>
                                <svg width="120" height="40" viewBox="0 0 120 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-slate-300">
                                    <path d="M10 20 Q 60 -10 110 20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 6" />
                                    <path d="M95 10 L110 20 L95 30" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M25 10 L10 20 L25 30" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </motion.div>
                        </div>
                    )}

                    {/* Loading State */}
                    {loading && (
                        <div className="flex justify-center items-center py-20">
                            <div className="w-12 h-12 border-4 border-[#00629B]/20 border-t-[#00629B] rounded-full animate-spin"></div>
                        </div>
                    )}

                    {/* Error Message */}
                    {error && !loading && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-8 mx-4 text-amber-800 text-sm"
                        >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <span>⚠️ {error}</span>
                                <button
                                    onClick={fetchEvents}
                                    className="self-start sm:self-auto bg-amber-100 hover:bg-amber-200 text-amber-900 px-3 py-1.5 rounded-lg font-semibold transition-colors"
                                >
                                    Retry
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* Events Grid */}
                    {!loading && extendedEvents.length > 0 && (
                        <motion.div
                            variants={STAGGER}
                            initial="hidden"
                            whileInView="show"
                            viewport={{ once: true, margin: "-100px" }}
                            className="grid grid-cols-1 md:grid-cols-2 gap-8 px-4"
                        >
                            {extendedEvents.map((event, index) => (
                                <motion.div
                                    key={event.$id}
                                    variants={FADE_UP}
                                    whileHover={{ y: -8 }}
                                    onClick={() => setSelectedEvent(event)}
                                    className="bg-white rounded-[2.5rem] p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] transition-all duration-500 cursor-pointer flex flex-col relative group"
                                >
                                    {/* Card Annotations */}
                                    {index === 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            whileInView={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: 0.7, type: "spring", bounce: 0.5 }}
                                            className="absolute -top-8 left-0 md:-left-4 z-20 pointer-events-none scale-75 md:scale-100 origin-top-left"
                                        >
                                            <span className="font-handwriting text-xl text-[#4285F4] bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm border border-slate-100 rotate-[-12deg] inline-block">
                                                For the builders 🛠️
                                            </span>
                                        </motion.div>
                                    )}
                                    {/* Mobile ONLY: Tough choice! (Between cards 1 and 2) */}
                                    {index === 0 && extendedEvents.length >= 2 && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            whileInView={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: 0.8, type: "spring", bounce: 0.5 }}
                                            className="absolute -bottom-8 right-6 z-20 sm:hidden pointer-events-none scale-90 origin-bottom-right"
                                        >
                                            <span className="font-handwriting text-xl text-[#FBBC05] bg-white/90 backdrop-blur-sm px-4 py-1.5 rounded-full shadow-md border border-slate-100 rotate-[-8deg] inline-block">
                                                Tough choice! 👀
                                            </span>
                                        </motion.div>
                                    )}
                                    {index === 1 && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            whileInView={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: 0.9, type: "spring", bounce: 0.5 }}
                                            className="absolute -bottom-4 right-0 md:-right-4 z-20 pointer-events-none scale-75 md:scale-100 origin-bottom-right"
                                        >
                                            <span className="font-handwriting text-xl text-[#34A853] bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm border border-slate-100 rotate-[8deg] inline-block">
                                                Free pizza? 🍕
                                            </span>
                                        </motion.div>
                                    )}
                                    {index === 2 && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            whileInView={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: 0.8, type: "spring", bounce: 0.5 }}
                                            className="absolute -top-8 right-0 md:-right-4 z-20 pointer-events-none scale-75 md:scale-100 origin-top-right"
                                        >
                                            <span className="font-handwriting text-xl text-[#EA4335] bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm border border-slate-100 rotate-[15deg] inline-block">
                                                Don&apos;t miss out! 🔥
                                            </span>
                                        </motion.div>
                                    )}
                                    {index === 3 && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            whileInView={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: 0.7, type: "spring", bounce: 0.5 }}
                                            className="absolute -bottom-4 left-0 md:-left-4 z-20 pointer-events-none scale-75 md:scale-100 origin-bottom-left"
                                        >
                                            <span className="font-handwriting text-xl text-[#FBBC05] bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm border border-slate-100 rotate-[-10deg] inline-block">
                                                Level up! 🚀
                                            </span>
                                        </motion.div>
                                    )}
                                    {index === 4 && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            whileInView={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: 1.0, type: "spring", bounce: 0.5 }}
                                            className="absolute top-1/2 -right-2 md:-right-12 z-20 pointer-events-none scale-75 md:scale-100 origin-right"
                                        >
                                            <span className="font-handwriting text-xl text-[#00629B] bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm border border-slate-100 rotate-[5deg] inline-block">
                                                Limited seats 🎟️
                                            </span>
                                        </motion.div>
                                    )}

                                    {/* Event Image */}
                                    <div className="relative rounded-[2rem] overflow-hidden shrink-0 h-64">
                                        <div className="absolute inset-0 bg-slate-900/5 z-10 group-hover:bg-transparent transition-colors duration-500"></div>
                                        {event.banner_url ? (
                                            <Image
                                                src={event.banner_url}
                                                alt={event.title}
                                                fill
                                                className="object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-gradient-to-br from-[#00629B] to-[#4285F4] flex items-center justify-center">
                                                <CalendarDays className="w-16 h-16 text-white/50" />
                                            </div>
                                        )}
                                        {/* Tag Badge */}
                                        <div className="absolute top-4 left-4 z-20 flex gap-2">
                                            <span className={`${event.color} text-white text-xs font-bold px-4 py-2 rounded-full uppercase tracking-wider shadow-sm backdrop-blur-md`}>
                                                {event.tags?.[0] || 'Event'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Event Content */}
                                    <div className="px-4 pt-6 pb-4 flex-grow flex flex-col justify-center">
                                        <div className="flex justify-between items-center mb-2">
                                            <div>
                                                <h3 className="text-2xl font-bold text-slate-800 mb-2 leading-tight">{event.title}</h3>
                                                <p className="text-[15px] font-medium text-slate-500 flex items-center gap-2">
                                                    <CalendarDays size={18} className={event.textColor} />
                                                    {new Date(event.date).toLocaleDateString('en-US', {
                                                        month: 'long',
                                                        day: 'numeric',
                                                        year: 'numeric'
                                                    })}
                                                </p>
                                            </div>
                                            <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-100 shadow-sm flex items-center justify-center text-slate-400 shrink-0 ml-4 group-hover:bg-slate-100 group-hover:text-slate-800 transition-colors">
                                                <ChevronRight size={24} />
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </motion.div>
                    )}

                    {/* Empty State */}
                    {!loading && extendedEvents.length === 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-center py-20 px-4"
                        >
                            <CalendarDays className="w-16 h-16 mx-auto text-slate-300 mb-6" />
                            <h3 className="text-2xl font-bold text-slate-700 mb-2">No Upcoming Events</h3>
                            <p className="text-slate-500">Check back soon for exciting new events!</p>
                        </motion.div>
                    )}
                </div>
            </section>

            {/* ==================== TECHNICAL CURATOR OS SECTION ==================== */}
            <AnimatedSection className="py-20 sm:py-32 px-6 bg-white">
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
                    {/* Section Header */}
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

                    {/* Bento Grid */}
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
                            {/* Fun Annotation */}
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
                            {/* Fun Annotation */}
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
                            {/* Fun Annotation */}
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

                            {/* Animated chart visualization */}
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

                            {/* Background glow effect */}
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
            </AnimatedSection>

            <Footer />

            {/* ==================== EVENT DETAILS MODAL ==================== */}
            <AnimatePresence>
                {selectedEvent && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedEvent(null)}
                            className="fixed inset-0 bg-slate-900/30 backdrop-blur-md z-[100]"
                        />

                        {/* Modal */}
                        <motion.div
                            initial={{ y: "100%", opacity: 0.5 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: "100%", opacity: 0.5 }}
                            transition={{ type: "spring", damping: 28, stiffness: 250, mass: 0.8 }}
                            className="fixed bottom-0 left-0 right-0 md:top-0 md:m-auto md:w-[700px] md:h-fit bg-white rounded-t-[2.5rem] md:rounded-[2.5rem] shadow-2xl z-[101] max-h-[90vh] md:max-h-[85vh] flex flex-col overflow-hidden"
                        >
                            {/* Modal Header */}
                            <div className="relative px-6 pt-8 pb-6 md:px-10 shrink-0 border-b border-slate-100">
                                <button
                                    onClick={() => setSelectedEvent(null)}
                                    className="absolute top-6 right-6 md:top-8 md:right-8 w-10 h-10 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-full flex items-center justify-center transition-colors"
                                >
                                    <X size={20} />
                                </button>
                                <span className={`${selectedEvent.color} text-white text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider mb-4 inline-block shadow-sm`}>
                                    {selectedEvent.tags?.[0] || 'Event'}
                                </span>
                                <h2 className="text-3xl md:text-4xl font-black text-slate-800 leading-tight pr-12">{selectedEvent.title}</h2>
                            </div>

                            {/* Modal Scrollable Content */}
                            <div className="overflow-y-auto px-6 py-6 md:px-10 flex-grow custom-scrollbar">
                                <div className="flex flex-col sm:flex-row gap-6 mb-8 pb-8 border-b border-slate-100">
                                    <div className="flex items-center gap-3 text-slate-600">
                                        <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center shrink-0">
                                            <CalendarDays size={24} className={selectedEvent.textColor} />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Date & Time</p>
                                            <p className="text-[15px] font-semibold text-slate-800">
                                                {new Date(selectedEvent.date).toLocaleDateString('en-US', {
                                                    weekday: 'long',
                                                    month: 'long',
                                                    day: 'numeric',
                                                    year: 'numeric'
                                                })}
                                            </p>
                                            <p className="text-sm text-slate-500">
                                                {new Date(selectedEvent.date).toLocaleTimeString('en-US', {
                                                    hour: 'numeric',
                                                    minute: '2-digit',
                                                    hour12: true
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                    {selectedEvent.venue && (
                                        <div className="flex items-center gap-3 text-slate-600">
                                            <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center shrink-0">
                                                <MapPin size={24} className={selectedEvent.textColor} />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Location</p>
                                                <p className="text-[15px] font-semibold text-slate-800">{selectedEvent.venue}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="mb-8">
                                    <h4 className="text-lg font-bold text-slate-800 mb-3">About the Event</h4>
                                    <p className="text-slate-600 leading-relaxed">{selectedEvent.about}</p>
                                </div>

                                {selectedEvent.agenda && selectedEvent.agenda.length > 0 && (
                                    <div>
                                        <h4 className="text-lg font-bold text-slate-800 mb-4">Agenda</h4>
                                        <div className="flex flex-col gap-4">
                                            {selectedEvent.agenda.map((item, i) => (
                                                <div key={i} className="flex items-start gap-4">
                                                    <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${selectedEvent.color}`}></div>
                                                    <div>
                                                        <p className="text-[15px] font-bold text-slate-800">{item.title}</p>
                                                        <p className="text-sm text-slate-500">{item.time}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="p-6 border-t border-slate-100 bg-white/80 backdrop-blur-md shrink-0">
                                <button
                                    onClick={() => {
                                        if (selectedEvent.registration_open === false) {
                                            return;
                                        }
                                        setRegistrationEvent(selectedEvent);
                                        setIsRegistrationModalOpen(true);
                                        setSelectedEvent(null);
                                    }}
                                    disabled={selectedEvent.registration_open === false}
                                    className={`w-full ${selectedEvent.registration_open === false ? 'bg-slate-400 cursor-not-allowed' : selectedEvent.color} text-white px-8 py-4 rounded-2xl font-bold text-[16px] ${selectedEvent.registration_open === false ? '' : 'hover:opacity-90'} transition-opacity shadow-lg flex items-center justify-center gap-2 group/btn`}
                                >
                                    {selectedEvent.registration_open === false
                                        ? 'Registration Closed'
                                        : selectedEvent.price === 0
                                            ? 'Register Now'
                                            : `Get Tickets • ₹${selectedEvent.price}`}
                                    <Ticket size={20} className="group-hover/btn:rotate-12 group-hover/btn:scale-110 transition-transform" />
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Event Registration Modal */}
            {registrationEvent && (
                <EventRegistrationModal
                    isOpen={isRegistrationModalOpen}
                    onClose={() => {
                        setIsRegistrationModalOpen(false);
                        setRegistrationEvent(null);
                    }}
                    event={registrationEvent}
                />
            )}

            {/* My Tickets Floating Button & Panel */}
            <MyTicketsSection />
        </main>
    );
}
