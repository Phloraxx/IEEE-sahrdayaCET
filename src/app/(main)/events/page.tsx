'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence } from 'framer-motion';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
    EventHeroSection,
    EventListSection,
    EventDetailModal,
    TechnicalCuratorSection,
    EventWithSociety,
    ExtendedEvent,
} from '@/components/events';
import { useUpcomingEvents } from '@/hooks/useEvents';

const EventRegistrationModal = dynamic(
    () => import('@/components/EventRegistrationModal'),
    { ssr: false, loading: () => null }
);

const MyTicketsSection = dynamic(
    () => import('@/components/tickets/MyTicketsSection').then((mod) => mod.MyTicketsSection),
    { ssr: false, loading: () => null }
);

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

export default function Events1Page() {
    const { events, loading, error, refresh } = useUpcomingEvents();
    const [selectedEvent, setSelectedEvent] = useState<ExtendedEvent | null>(null);
    const [registrationEvent, setRegistrationEvent] = useState<EventWithSociety | null>(null);
    const [isRegistrationModalOpen, setIsRegistrationModalOpen] = useState(false);

    useEffect(() => {
        if (selectedEvent) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [selectedEvent]);

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

    const handleSelectEvent = useCallback((event: ExtendedEvent) => {
        setSelectedEvent(event);
    }, []);

    const handleRegister = useCallback((event: EventWithSociety) => {
        setRegistrationEvent(event);
        setIsRegistrationModalOpen(true);
    }, []);

    return (
        <main className="min-h-screen text-slate-800 font-sans selection:bg-[#00629B] selection:text-white overflow-x-hidden relative bg-[#F8F9FA]">
            <style jsx global>{`
                .font-handwriting { font-family: var(--font-caveat-loaded), cursive; }
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
                @keyframes marquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
                .animate-marquee { animation: marquee 25s linear infinite; }
            `}</style>

            <div
                className="fixed inset-0 pointer-events-none opacity-[0.02] z-50 mix-blend-overlay"
                style={{
                    backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")'
                }}
            />

            <Navbar />

            <EventHeroSection />

            <section className="px-4 max-w-[1400px] mx-auto">
                <EventListSection
                    events={extendedEvents}
                    loading={loading}
                    error={error}
                    onSelectEvent={handleSelectEvent}
                    onRetry={refresh}
                />
            </section>

            <TechnicalCuratorSection />

            <Footer />

            <AnimatePresence>
                {selectedEvent && (
                    <EventDetailModal
                        event={selectedEvent}
                        onClose={() => setSelectedEvent(null)}
                        onRegister={handleRegister}
                    />
                )}
            </AnimatePresence>

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

            <MyTicketsSection />
        </main>
    );
}
