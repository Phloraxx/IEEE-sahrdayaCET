import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import type { ExtendedEvent } from '@/types';
import { formatDate } from '@/lib/dates';

const FADE_UP = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const ANNOTATIONS: { index: number; text: string; color: string; rotate: string; position: string }[] = [
    { index: 0, text: "For the builders 🛠️", color: 'text-[#4285F4]', rotate: '-12deg', position: '-top-8 left-0 md:-left-4 origin-top-left' },
    { index: 1, text: "Free pizza? 🍕", color: 'text-[#34A853]', rotate: '8deg', position: '-bottom-4 right-0 md:-right-4 origin-bottom-right' },
    { index: 2, text: "Don't miss out! 🔥", color: 'text-[#EA4335]', rotate: '15deg', position: '-top-8 right-0 md:-right-4 origin-top-right' },
    { index: 3, text: "Level up! 🚀", color: 'text-[#FBBC05]', rotate: '-10deg', position: '-bottom-4 left-0 md:-left-4 origin-bottom-left' },
    { index: 4, text: "Limited seats 🎟️", color: 'text-ieee-blue', rotate: '5deg', position: 'top-1/2 -right-2 md:-right-12 origin-right' },
];

interface EventCardProps {
    event: ExtendedEvent;
    index: number;
    onSelect: (event: ExtendedEvent) => void;
    isMobile?: boolean;
    showAnnotations?: boolean;
    animateEntrance?: boolean;
}

export function AnnotatedEventCard({ event, index, onSelect, isMobile = false, showAnnotations = true, animateEntrance = true }: EventCardProps) {
    const prefersReducedMotion = useReducedMotion();
    const annotation = showAnnotations ? ANNOTATIONS.find(a => a.index === index) : undefined;

    return (
        <motion.div
            variants={prefersReducedMotion || !animateEntrance ? undefined : FADE_UP}
            whileHover={prefersReducedMotion ? undefined : { y: -8 }}
            className="relative"
        >
          <Link
            to={`/events/${event.slug}`}
            onClick={(e) => {
              // Keep the original in-page modal for ordinary clicks while leaving
              // a real crawlable URL in the document. Modified clicks still open
              // the canonical detail page in a new tab/window as users expect.
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              onSelect(event);
            }}
            className="bg-white rounded-[2.5rem] p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] transition-all duration-500 cursor-pointer flex flex-col relative group"
          >
            {/* Annotation */}
            {annotation && (
                <motion.div
                    initial={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.8 }}
                    whileInView={prefersReducedMotion ? undefined : { opacity: 1, scale: 1 }}
                    transition={prefersReducedMotion ? undefined : { delay: 0.7 + index * 0.1, type: "spring", bounce: 0.5 }}
                    className={`absolute ${annotation.position} z-20 pointer-events-none scale-75 md:scale-100`}
                >
                    <span className={`font-handwriting text-xl ${annotation.color} bg-white/80 backdrop-blur-xs px-3 py-1 rounded-full shadow-xs border border-slate-100 inline-block`} style={{ transform: `rotate(${annotation.rotate})` }}>
                        {annotation.text}
                    </span>
                </motion.div>
            )}

            {/* Mobile-only tough choice annotation between cards 0 and 1 */}
            {showAnnotations && index === 0 && !isMobile && (
                <motion.div
                    initial={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.8 }}
                    whileInView={prefersReducedMotion ? undefined : { opacity: 1, scale: 1 }}
                    transition={prefersReducedMotion ? undefined : { delay: 0.8, type: "spring", bounce: 0.5 }}
                    className="absolute -bottom-8 right-6 z-20 sm:hidden pointer-events-none scale-90 origin-bottom-right"
                >
                    <span className="font-handwriting text-xl text-[#FBBC05] bg-white/90 backdrop-blur-xs px-4 py-1.5 rounded-full shadow-md border border-slate-100 rotate-[-8deg] inline-block">
                        Tough choice! 👀
                    </span>
                </motion.div>
            )}

            {/* Event Image */}
            <div className="relative rounded-4xl overflow-hidden shrink-0 h-64">
                <div className="absolute inset-0 bg-slate-900/5 z-10 group-hover:bg-transparent transition-colors duration-500" />
                {event.bannerUrl ? (
                    <img
                        src={event.bannerUrl}
                        alt={event.title}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                    />
                ) : (
                    <div className="w-full h-full bg-linear-to-br from-ieee-blue to-[#4285F4] flex items-center justify-center">
                        <CalendarDays className="w-16 h-16 text-white/50" />
                    </div>
                )}
                <div className="absolute top-4 left-4 z-20 flex gap-2">
                    <span className={`${event.color} text-white text-xs font-bold px-4 py-2 rounded-full uppercase tracking-wider shadow-xs backdrop-blur-md`}>
                        {event.tags || 'Event'}
                    </span>
                </div>
            </div>

            {/* Event Content */}
            <div className="px-4 pt-6 pb-4 grow flex flex-col justify-center">
                <div className="flex justify-between items-center mb-2">
                    <div>
                        <h3 className="text-2xl font-bold text-slate-800 mb-2 leading-tight">{event.title}</h3>
                        <p className="text-[15px] font-medium text-slate-500 flex items-center gap-2">
                            <CalendarDays size={18} className={event.textColor} />
                            {formatDate(event.date)}
                        </p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-100 shadow-xs flex items-center justify-center text-slate-400 shrink-0 ml-4 group-hover:bg-slate-100 group-hover:text-slate-800 transition-colors">
                        <ChevronRight size={24} />
                    </div>
                </div>
            </div>
          </Link>
        </motion.div>
    );
}
