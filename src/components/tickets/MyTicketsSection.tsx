'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Ticket, 
    ChevronRight,
    Loader2,
    AlertCircle,
    X,
    QrCode
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { TicketCard } from './TicketCard';
import Link from 'next/link';
import TicketDisplay from '@/components/TicketDisplay';
import type { Event as AppEvent } from '@/types';
import type { Ticket as RegistrationTicket } from '@/types/registration';

interface TicketData {
    ticket: {
        id: string;
        qr_data?: string;
        is_scanned?: boolean;
        scanned_at?: string;
        createdAt: string;
    } | null;
    event: {
        id: string;
        title: string;
        description?: string;
        date: string;
        venue?: string;
        price?: number;
        bannerUrl?: string;
        status?: string;
    } | null;
    registration: {
        id: string;
        eventId: string;
        paymentStatus: string;
        registrationStatus: string;
        formResponses?: Record<string, unknown>;
        createdAt: string;
        updatedAt: string;
    };
}

interface MyTicketsResponse {
    docs: TicketData[];
    totalDocs: number;
    limit: number;
    page: number;
    totalPages: number;
}

type TabType = 'upcoming' | 'pending' | 'past';

export function MyTicketsSection() {
    const { user, status: authStatus } = useAuth();
    const authLoading = authStatus === 'loading';
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('upcoming');
    const [tickets, setTickets] = useState<MyTicketsResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedTicket, setSelectedTicket] = useState<TicketData | null>(null);

    const fetchTickets = useCallback(async (signal?: AbortSignal) => {
        if (!user) return;
        
        setLoading(true);
        setError(null);
        
        try {
            const response = await fetch('/api/registrations', {
                credentials: 'include',
                signal,
            });
            
            if (!response.ok) {
                if (response.status === 401) {
                    setError('Please sign in to view your tickets');
                    return;
                }
                throw new Error('Failed to fetch tickets');
            }
            
            const data = await response.json();
            if (!signal?.aborted) {
                setTickets(data);
            }
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') return;
            console.error('Failed to fetch tickets:', err);
            if (!signal?.aborted) {
                setError('Failed to load your tickets');
            }
        } finally {
            if (!signal?.aborted) {
                setLoading(false);
            }
        }
    }, [user]);

    useEffect(() => {
        if (isOpen && user) {
            const controller = new AbortController();
            fetchTickets(controller.signal);
            return () => controller.abort();
        }
    }, [isOpen, user, fetchTickets]);

    // Categorize tickets from flat docs array
    const categorizeTickets = (docs: TicketData[]) => {
        const now = new Date();
        const upcoming: TicketData[] = [];
        const pending: TicketData[] = [];
        const past: TicketData[] = [];
        for (const item of docs) {
            const eventDate = item.event ? new Date(item.event.date) : new Date();
            if (item.registration.paymentStatus === 'pending') {
                pending.push(item);
            } else if (eventDate >= now) {
                upcoming.push(item);
            } else {
                past.push(item);
            }
        }
        return { upcoming, pending, past, all: docs };
    };

    const categorized = categorizeTickets(tickets?.docs || []);

    const tabs: { key: TabType; label: string; count: number }[] = [
        { key: 'upcoming', label: 'Upcoming', count: categorized.upcoming.length },
        { key: 'pending', label: 'Pending', count: categorized.pending.length },
        { key: 'past', label: 'Past', count: categorized.past.length },
    ];

    const currentTickets = categorized[activeTab] || [];

    // Don't show button if not logged in
    if (authLoading || !user) {
        return null;
    }

    return (
        <>
            {/* Floating Button */}
            <motion.button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 z-40 bg-ieee-blue text-white p-4 rounded-2xl shadow-lg hover:shadow-xl transition-shadow flex items-center gap-3 group"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
            >
                <Ticket className="w-6 h-6" />
                <span className="font-semibold">My Tickets</span>
                {tickets && tickets.totalDocs > 0 && (
                    <span className="bg-white/20 px-2 py-0.5 rounded-full text-sm">
                        {tickets.totalDocs}
                    </span>
                )}
            </motion.button>

            {/* Slide-out Panel */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                            onClick={() => setIsOpen(false)}
                            className="fixed inset-0 bg-black/30 backdrop-blur-xl z-[200]"
                        />

                        {/* Panel */}
                        <motion.div
                            initial={{ x: '100%', opacity: 0.5 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: '100%', opacity: 0.5 }}
                            transition={{ type: 'spring', damping: 28, stiffness: 280, mass: 0.8 }}
                            className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-white/95 backdrop-blur-3xl z-[210] shadow-[-30px_0_60px_rgba(0,0,0,0.1)] flex flex-col sm:rounded-l-[40px] border-l border-white/50 ring-1 ring-black/[0.03]"
                        >
                            {/* Header */}
                            <div className="relative p-8 pt-10 text-white shrink-0 sm:rounded-tl-[40px] overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-ieee-blue to-ieee-light-blue z-0" />
                                <div className="absolute inset-0 bg-black/10 z-0" />
                                <div className="relative z-10 flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-3">
                                        <QrCode className="w-8 h-8" />
                                        <div>
                                            <h2 className="text-xl font-bold">My Tickets</h2>
                                            <p className="text-white/80 text-sm">
                                                Your registered events
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setIsOpen(false)}
                                        aria-label="Close tickets panel"
                                        className="p-2.5 hover:bg-white/20 active:bg-white/30 rounded-[14px] transition-all duration-200 hover:scale-105 active:scale-95"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                {/* Tabs */}
                                <div className="flex gap-2 relative z-10">
                                    {tabs.map((tab) => (
                                        <button
                                            key={tab.key}
                                            onClick={() => setActiveTab(tab.key)}
                                            className={`px-5 py-2.5 rounded-[16px] text-[14px] font-semibold transition-all duration-300 ${
                                                activeTab === tab.key
                                                    ? 'bg-white text-ieee-blue shadow-[0_4px_12px_rgba(0,0,0,0.1)] scale-105'
                                                    : 'bg-white/10 text-white hover:bg-white/25 active:scale-95'
                                            }`}
                                        >
                                            {tab.label}
                                            {tab.count > 0 && (
                                                <span className={`ml-2 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                                    activeTab === tab.key
                                                        ? 'bg-ieee-blue/10 text-ieee-blue'
                                                        : 'bg-white/20 text-white'
                                                }`}>
                                                    {tab.count}
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6 sm:scrollbar-hide">
                            {loading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <Loader2 className="w-8 h-8 text-ieee-blue animate-spin" />
                                    </div>
                                ) : error ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-center">
                                        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                                        <p className="text-gray-600">{error}</p>
                                        <button
                                            onClick={() => fetchTickets()}
                                            className="mt-4 px-4 py-2 bg-ieee-blue text-white rounded-lg text-sm font-medium hover:bg-ieee-blue/90 transition-colors"
                                        >
                                            Try Again
                                        </button>
                                    </div>
                                ) : currentTickets.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-center">
                                        <Ticket className="w-16 h-16 text-gray-300 mb-4" />
                                        <h3 className="text-lg font-semibold text-gray-700 mb-2">
                                            No {activeTab} tickets
                                        </h3>
                                        <p className="text-gray-500 text-sm max-w-xs">
                                            {activeTab === 'upcoming'
                                                ? 'Register for events to see your tickets here'
                                                : activeTab === 'pending'
                                                ? 'No pending registrations'
                                                : 'Your past event tickets will appear here'}
                                        </p>
                                        {activeTab === 'upcoming' && (
                                            <button
                                                onClick={() => setIsOpen(false)}
                                                className="mt-6 px-6 py-3 bg-ieee-blue text-white rounded-xl font-semibold hover:bg-ieee-blue/90 transition-colors"
                                            >
                                                Browse Events
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <motion.div
                                        initial="hidden"
                                        animate="show"
                                        variants={{
                                            hidden: { opacity: 0 },
                                            show: {
                                                opacity: 1,
                                                transition: { staggerChildren: 0.1 }
                                            }
                                        }}
                                        className="space-y-4"
                                    >
                                        {currentTickets.map((item) => (
                                            <motion.div
                                                key={item.registration.id}
                                                variants={{
                                                    hidden: { opacity: 0, y: 20 },
                                                    show: { opacity: 1, y: 0 }
                                                }}
                                            >
                                                <TicketCard
                                                    ticket={item.ticket}
                                                    event={item.event}
                                                    registration={item.registration}
                                                    variant="compact"
                                                    onViewTicket={() => setSelectedTicket(item)}
                                                />
                                            </motion.div>
                                        ))}
                                    </motion.div>
                                )}
                            </div>

                            {/* Footer */}
                            {tickets && tickets.totalDocs > 0 && (
                                <div className="shrink-0 p-4 border-t border-gray-200 bg-gray-50">
                                    <div className="flex items-center justify-between text-sm text-gray-600">
                                        <span>Total registrations: {tickets.totalDocs}</span>
                                        <Link
                                            href="/profile/tickets"
                                            className="flex items-center gap-1 text-ieee-blue font-medium hover:underline"
                                            onClick={() => setIsOpen(false)}
                                        >
                                            View All
                                            <ChevronRight className="w-4 h-4" />
                                        </Link>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {selectedTicket && selectedTicket.event && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[210] bg-gray-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
                        onClick={() => setSelectedTicket(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 40 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 40 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full sm:max-w-[540px] h-[92vh] sm:h-auto sm:max-h-[85vh] bg-white rounded-t-[32px] sm:rounded-[32px] overflow-hidden shadow-[0_20px_40px_-15px_rgba(0,0,0,0.2)] flex flex-col border border-gray-100/50"
                        >
                            <div className="flex items-center justify-between px-6 py-5 bg-white z-10">
                                <div className="flex items-center gap-4 border-l-4 border-ieee-blue pl-3">
                                    <div>
                                        <h2 className="font-bold text-gray-900 text-[17px] tracking-tight line-clamp-1">
                                            Your Ticket
                                        </h2>
                                        <p className="text-[12px] font-medium text-ieee-blue opacity-80 line-clamp-1">
                                            {selectedTicket.event.title}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedTicket(null)}
                                    className="p-2 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors group"
                                    aria-label="Close"
                                >
                                    <X className="w-4 h-4 text-gray-500 group-hover:text-gray-900" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto sm:scrollbar-hide pb-2">
                                <TicketDisplay
                                    ticket={{
                                        ticketId: selectedTicket.ticket?.id || selectedTicket.registration.id,
                                        eventId: selectedTicket.event.id,
                                        eventTitle: selectedTicket.event.title,
                                        eventDate: selectedTicket.event.date,
                                        eventVenue: selectedTicket.event.venue,
                                        userId: user?.id || '',
                                        userName: user?.name || '',
                                        userEmail: user?.email || '',
                                        registrationId: selectedTicket.registration.id,
                                        status: selectedTicket.registration.registrationStatus as RegistrationTicket['status'],
                                        qrCodeData: selectedTicket.ticket?.id || selectedTicket.registration.id,
                                        createdAt: selectedTicket.ticket?.createdAt || selectedTicket.registration.createdAt,
                                    }}
                                    event={{
                                        id: selectedTicket.event.id,
                                        createdAt: selectedTicket.registration.createdAt,
                                        updatedAt: selectedTicket.registration.updatedAt,
                                        title: selectedTicket.event.title,
                                        description: selectedTicket.event.description,
                                        date: selectedTicket.event.date,
                                        venue: selectedTicket.event.venue,
                                        price: selectedTicket.event.price || 0,
                                        bannerUrl: selectedTicket.event.bannerUrl,
                                        status: (selectedTicket.event.status as AppEvent['status']) || 'published',
                                    }}
                                    onClose={() => setSelectedTicket(null)}
                                />
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

export default MyTicketsSection;
