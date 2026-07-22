'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, CalendarDays, MapPin, X } from 'lucide-react';
import type { ExtendedEvent, EventWithSociety } from '@/types';
import { formatDate, formatTime } from '@/lib/dates';
import {
    RelatedBlogCards,
    type RelatedBlogSummary,
} from '@/components/blog/RelatedBlogCards';
import { listRelatedBlogs } from '@/lib/data/public-client';

interface EventDetailModalProps {
    event: ExtendedEvent;
    onClose: () => void;
    onRegister?: (event: EventWithSociety) => void;
}

export function EventDetailModal({ event, onClose, onRegister }: EventDetailModalProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const [relatedBlogs, setRelatedBlogs] = useState<RelatedBlogSummary[]>([]);

    useEffect(() => {
        let active = true;
        setRelatedBlogs([]);
        void listRelatedBlogs({ eventId: event.id, limit: 2 })
            .then((data) => { if (active) setRelatedBlogs(data.items); })
            .catch(() => { if (active) setRelatedBlogs([]); });
        return () => { active = false; };
    }, [event.id]);

    // Body scroll lock & focus trap
    useEffect(() => {
        document.body.style.overflow = 'hidden';

        const dialog = dialogRef.current;
        if (dialog) {
            const focusable = dialog.querySelector<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            if (focusable) {
                focusable.focus();
            } else {
                dialog.focus();
            }
        }

        return () => {
            document.body.style.overflow = '';
        };
    }, []);

    return (
        <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={event.title}
            onKeyDown={(e) => {
                if (e.key === 'Escape') onClose();
                if (e.key === 'Tab') {
                    const dialog = dialogRef.current;
                    if (!dialog) return;
                    const focusable = dialog.querySelectorAll<HTMLElement>(
                        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                    );
                    const first = focusable[0] ?? null;
                    const last = focusable[focusable.length - 1] ?? null;
                    if (!first || !last) return;
                    if (e.shiftKey) {
                        if (document.activeElement === first) {
                            e.preventDefault();
                            last.focus();
                        }
                    } else if (document.activeElement === last) {
                        e.preventDefault();
                        first.focus();
                    }
                }
            }}
            tabIndex={-1}
        >
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 bg-slate-900/30 backdrop-blur-md z-100"
            />

            <motion.div
                initial={{ y: "100%", opacity: 0.5 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "100%", opacity: 0.5 }}
                transition={{ type: "spring", damping: 28, stiffness: 250, mass: 0.8 }}
                className="fixed bottom-0 left-0 right-0 md:top-0 md:m-auto md:w-[700px] md:h-fit bg-white rounded-t-[2.5rem] md:rounded-[2.5rem] shadow-2xl z-101 max-h-[90vh] md:max-h-[85vh] flex flex-col overflow-hidden"
            >
                <div className="relative px-6 pt-8 pb-6 md:px-10 shrink-0 border-b border-slate-100">
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="absolute top-6 right-6 md:top-8 md:right-8 w-10 h-10 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-full flex items-center justify-center transition-colors"
                    >
                        <X size={20} />
                    </button>
                    <span className={`${event.color} text-white text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider mb-4 inline-block shadow-xs`}>
                        {event.tags || 'Event'}
                    </span>
                    <h2 className="text-3xl md:text-4xl font-black text-slate-800 leading-tight pr-12">{event.title}</h2>
                </div>

                <div className="overflow-y-auto px-6 py-6 md:px-10 grow custom-scrollbar">
                    <div className="flex flex-col sm:flex-row gap-6 mb-8 pb-8 border-b border-slate-100">
                        <div className="flex items-center gap-3 text-slate-600">
                            <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center shrink-0">
                                <CalendarDays size={24} className={event.textColor} />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Date & Time</p>
                                <p className="text-[15px] font-semibold text-slate-800">{formatDate(event.date)}</p>
                                <p className="text-sm text-slate-500">{formatTime(event.date)}</p>
                            </div>
                        </div>
                        {event.venue && (
                            <div className="flex items-center gap-3 text-slate-600">
                                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center shrink-0">
                                    <MapPin size={24} className={event.textColor} />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Location</p>
                                    <p className="text-[15px] font-semibold text-slate-800">{event.venue}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="mb-8">
                        <h4 className="text-lg font-bold text-slate-800 mb-3">About the Event</h4>
                        <p className="text-slate-600 leading-relaxed">{event.about}</p>
                    </div>

                    {event.agenda && (typeof event.agenda === 'string' ? JSON.parse(event.agenda) : event.agenda).length > 0 && (
                        <div className="mb-8">
                            <h4 className="text-lg font-bold text-slate-800 mb-4">Agenda</h4>
                            <div className="flex flex-col gap-4">
                                {(typeof event.agenda === 'string' ? JSON.parse(event.agenda) : event.agenda).map((item: { title: string; time: string }, i: number) => (
                                    <div key={i} className="flex items-start gap-4">
                                        <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${event.color}`} />
                                        <div>
                                            <p className="text-[15px] font-bold text-slate-800">{item.title}</p>
                                            <p className="text-sm text-slate-500">{item.time}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {relatedBlogs.length > 0 && (
                        <div className="border-t border-slate-100 pt-8">
                            <div className="mb-4 flex items-center gap-2">
                                <BookOpen className="h-4 w-4 text-ieee-blue" />
                                <h4 className="text-lg font-bold text-slate-800">Related stories</h4>
                            </div>
                            <RelatedBlogCards blogs={relatedBlogs} compact />
                        </div>
                    )}
                </div>

                {onRegister && (
                    <div className="p-6 border-t border-slate-100 bg-white/80 backdrop-blur-md shrink-0">
                        <button
                            onClick={() => {
                                if (event.registrationOpen === false) return;
                                onRegister(event);
                                onClose();
                            }}
                            disabled={event.registrationOpen === false}
                            className={`w-full ${event.registrationOpen === false ? 'bg-slate-400 cursor-not-allowed' : event.color} text-white px-8 py-4 rounded-2xl font-bold text-[16px] ${event.registrationOpen === false ? '' : 'hover:opacity-90'} transition-opacity shadow-lg flex items-center justify-center gap-2 group/btn`}
                        >
                            {event.registrationOpen === false
                                ? 'Registration Closed'
                                : event.price === 0
                                    ? 'Register Now'
                                    : `Get Tickets • ₹${event.price}`}
                        </button>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
