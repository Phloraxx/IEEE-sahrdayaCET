'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { CalendarDays } from 'lucide-react';
import type { ExtendedEvent } from '@/types';
import { AnnotatedEventCard as EventCard } from './AnnotatedEventCard';

const STAGGER = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.12 } },
};

interface EventListSectionProps {
  events: ExtendedEvent[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  title?: string;
  emptyTitle?: string;
  emptyMessage?: string;
  showAnnotation?: boolean;
  sectionId?: string;
  showHeader?: boolean;
  animateCards?: boolean;
}

export function EventListSection({
  events,
  loading,
  error,
  onRetry,
  title = 'Upcoming Events',
  emptyTitle = 'No Upcoming Events',
  emptyMessage = 'Check back soon for exciting new events!',
  showAnnotation = true,
  sectionId = 'events-section',
  showHeader = true,
  animateCards = true,
}: EventListSectionProps) {
  return (
    <div className="max-w-[1100px] mx-auto relative mt-8" id={sectionId}>
      {showHeader && (
        <div className="flex items-center justify-between mb-16 px-4">
          <h2 className="text-4xl font-black tracking-tight text-slate-800 flex items-center gap-4">
            {title}
            <span className="bg-[#EA4335]/10 text-[#EA4335] text-sm px-4 py-1.5 rounded-full font-bold tracking-wide align-middle">
              {loading ? '...' : events.length}
            </span>
          </h2>
        </div>
      )}

      {showAnnotation && !loading && (
        <div className="hidden sm:block absolute top-12 left-1/2 -translate-x-1/2 z-20 pointer-events-none origin-center">
          <motion.div
            initial={{ opacity: 0, y: 10, rotate: -10 }}
            whileInView={{ opacity: 1, y: 0, rotate: -5 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5, type: 'spring' }}
            className="relative"
          >
            <span
              className={`font-handwriting text-2xl absolute -top-8 -left-24 whitespace-nowrap rotate-[-10deg] ${
                events.length === 0
                  ? 'text-[#EA4335]'
                  : events.length === 1
                    ? 'text-[#34A853]'
                    : 'text-[#FBBC05]'
              }`}
            >
              {events.length === 0
                ? 'Cooking things up! 🍳'
                : events.length === 1
                  ? "Don't miss out! 🏃‍♂️"
                  : 'Tough choice! 👀'}
            </span>
            <svg
              width="120"
              height="40"
              viewBox="0 0 120 40"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-slate-300"
            >
              <path d="M10 20 Q 60 -10 110 20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 6" />
              <path d="M95 10 L110 20 L95 30" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M25 10 L10 20 L25 30" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.div>
        </div>
      )}

      {loading && (
        <div className="flex justify-center items-center py-20">
          <div className="w-12 h-12 border-4 border-ieee-blue/20 border-t-ieee-blue rounded-full animate-spin" />
        </div>
      )}

      {error && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-8 mx-4 text-amber-800 text-sm"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>⚠️ {error}</span>
            <button
              onClick={onRetry}
              className="self-start sm:self-auto bg-amber-100 hover:bg-amber-200 text-amber-900 px-3 py-1.5 rounded-lg font-semibold transition-colors"
            >
              Retry
            </button>
          </div>
        </motion.div>
      )}

      {!loading && events.length > 0 && (
        <motion.div
          variants={animateCards ? STAGGER : undefined}
          initial={animateCards ? 'hidden' : false}
          whileInView={animateCards ? 'show' : undefined}
          viewport={animateCards ? { once: true, margin: '-100px' } : undefined}
          className="grid grid-cols-1 md:grid-cols-2 gap-8 px-4"
        >
          {events.map((event, index) => (
            <EventCard
              key={event.id}
              event={event}
              index={index}
              showAnnotations={showAnnotation}
              animateEntrance={animateCards}
            />
          ))}
        </motion.div>
      )}

      {!loading && events.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20 px-4"
        >
          <CalendarDays className="w-16 h-16 mx-auto text-slate-300 mb-6" />
          <h3 className="text-2xl font-bold text-slate-700 mb-2">{emptyTitle}</h3>
          <p className="text-slate-500">{emptyMessage}</p>
        </motion.div>
      )}
    </div>
  );
}
