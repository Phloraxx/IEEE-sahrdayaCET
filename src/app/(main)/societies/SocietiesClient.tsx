'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { Society, Event } from '@/types';
import Navbar from '@/components/Navbar';
import { GridBackground } from '@/components/GridBackground';
import { FloatingIcons } from '@/components/FloatingIcons';
import { TechnicalDetails } from '@/components/TechnicalDetails';
import { Loader2, X, Calendar, Users, Award } from 'lucide-react';
import { useSession, signIn } from 'next-auth/react';
import EventCard from '@/components/EventCard';
import Footer from '@/components/Footer';

interface ExecomMember {
    slNo: number;
    name: string;
    department: string;
    semester: string;
    position: string;
    photoUrl?: string;
    linkedin?: string;
    instagram?: string;
    email?: string;
    phone?: string;
}

interface SocietyData {
    $id: string;
    name: string;
    tagline: string;
    description: string;
    logo_url: string;
    website_url: string;
    linkedin_url: string;
    email: string;
    member_count: number;
    events_count: number;
    founded: number;
    color: string;
}

export default function SocietiesClient() {
    const [societies, setSocieties] = useState<Society[]>([]);
    const [events, setEvents] = useState<Record<string, Event[]>>({});
    const [members, setMembers] = useState<Record<string, ExecomMember[]>>({});
    const [loading, setLoading] = useState(true);
    const [selectedSociety, setSelectedSociety] = useState<Society | null>(null);
    const [error, setError] = useState('');
    const { data: session } = useSession();
    const user = session?.user;

    useEffect(() => {
        fetchSocieties();
    }, []);

    async function fetchSocieties() {
        try {
            setLoading(true);
            const res = await fetch('/api/societies?limit=50');
            if (!res.ok) throw new Error('Failed to fetch societies');
            const data = await res.json();
            const raw = data.docs || data.societies || [];
            const docs = raw.map((d: Record<string, unknown>) => ({ ...d, $id: d.id }));
            setSocieties(docs);

            // Fetch events per society
            for (const soc of docs) {
                const eRes = await fetch(`/api/events?where[society][equals]=${soc.id}&sort=-date&limit=10`);
                if (eRes.ok) {
                    const eData = await eRes.json();
                    const mappedEvents = (eData.docs || eData.events || []).map((e: Record<string, unknown>) => ({ ...e, $id: e.id }));
                    setEvents(prev => ({ ...prev, [soc.id]: mappedEvents }));
                }
                const mRes = await fetch(`/api/execom?where[sectionId][equals]=${soc.slug}&sort=slNo&limit=50`);
                if (mRes.ok) {
                    const mData = await mRes.json();
                    const docs2 = mData.docs || mData.execom || [];
                    setMembers(prev => ({ ...prev, [soc.slug]: docs2 }));
                }
            }
        } catch (err) {
            setError('Failed to load societies');
        } finally {
            setLoading(false);
        }
    }

    async function handleRegisterForEvent(event: Event) {
        if (!user) {
            signIn('google');
            return;
        }
        try {
            const res = await fetch('/api/registrations/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventId: event.$id,
                    formResponses: { name: user.name, email: user.email },
                }),
            });
            if (!res.ok) throw new Error('Registration failed');
        } catch {
            setError('Registration failed');
        }
    }

    function getEventPhoto(event: Event): string {
        if (event.banner_url) return event.banner_url;
        if (event.$id && events[event.$id]?.length) {
            const url = (events[event.$id][0] as unknown as Record<string, unknown>).bannerUrl as string;
            if (url) return url;
        }
        return '/placeholder-event.jpg';
    }

    function getExecomPhoto(member: ExecomMember): string {
        if (member.photoUrl) return member.photoUrl;
        return '/placeholder-person.jpg';
    }

    // Quick filtered societies for character selection
    const displayedSocieties = societies.filter(s => {
        if (!selectedSociety) return true;
        return s.$id === selectedSociety.$id;
    });

    const isChair = user && selectedSociety
        ? (user as unknown as Record<string, unknown>).teams?.toString().includes(selectedSociety.slug)
        : false;

    return (
        <>
            <Navbar />
            <GridBackground />
            <FloatingIcons />
            <TechnicalDetails />
            <main className="relative min-h-screen bg-gradient-to-b from-gray-50 to-white pt-24 pb-16">
                <div className="max-w-7xl mx-auto px-4">
                    {loading ? (
                        <div className="flex items-center justify-center min-h-[60vh]">
                            <Loader2 className="w-12 h-12 text-ieee-blue animate-spin" />
                        </div>
                    ) : error ? (
                        <div className="text-center py-20">
                            <p className="text-red-500 text-lg">{error}</p>
                        </div>
                    ) : (
                        <>
                            {/* Header */}
                            <div className="text-center mb-12">
                                <h1 className="font-pixel text-4xl md:text-5xl text-ieee-blue mb-4">Our Societies</h1>
                                <p className="text-gray-600 max-w-2xl mx-auto">
                                    Explore our technical societies, each driving innovation in their field
                                </p>
                            </div>

                            {/* Society Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {societies.map((society, index) => (
                                    <motion.div
                                        key={society.$id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.05 }}
                                        onClick={() => setSelectedSociety(selectedSociety?.$id === society.$id ? null : society)}
                                        className={`group relative bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer border-2 ${
                                            selectedSociety?.$id === society.$id
                                                ? 'border-ieee-blue'
                                                : 'border-transparent hover:border-ieee-light-blue/30'
                                        }`}
                                    >
                                        {/* Logo Area */}
                                        <div className="h-48 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-8">
                                            {society.logo_url ? (
                                                <Image
                                                    src={society.logo_url}
                                                    alt={society.name}
                                                    width={160}
                                                    height={160}
                                                    className="object-contain w-32 h-32 group-hover:scale-110 transition-transform duration-500"
                                                />
                                            ) : (
                                                <div className="w-32 h-32 rounded-full bg-ieee-blue/10 flex items-center justify-center">
                                                    <span className="font-pixel text-4xl text-ieee-blue">
                                                        {society.name.charAt(0)}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Info */}
                                        <div className="p-6">
                                            <h3 className="font-bold text-xl text-gray-900 mb-2">{society.name}</h3>
                                            {society.bio && (
                                                <p className="text-gray-500 text-sm line-clamp-2">{society.bio}</p>
                                            )}
                                        </div>

                                        {/* Expand indicator */}
                                        <div className="absolute bottom-4 right-4 w-8 h-8 rounded-full bg-ieee-blue/10 flex items-center justify-center group-hover:bg-ieee-blue/20 transition-colors">
                                            <span className="text-ieee-blue text-sm font-bold">
                                                {selectedSociety?.$id === society.$id ? '−' : '+'}
                                            </span>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            {/* Selected Society Detail Panel */}
                            <AnimatePresence>
                                {selectedSociety && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -20 }}
                                        className="mt-12 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
                                    >
                                        {/* Header */}
                                        <div className="relative h-64 bg-gradient-to-br from-ieee-blue to-ieee-light-blue">
                                            <div className="absolute inset-0 bg-black/10" />
                                            <div className="absolute bottom-0 left-0 right-0 p-8">
                                                <h2 className="text-3xl font-bold text-white mb-2">{selectedSociety.name}</h2>
                                                <div className="flex items-center gap-6 text-white/80 text-sm">
                                                    {selectedSociety.bio && (
                                                        <span className="line-clamp-1">{selectedSociety.bio}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setSelectedSociety(null)}
                                                className="absolute top-4 right-4 w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
                                            >
                                                <X className="w-5 h-5 text-white" />
                                            </button>
                                        </div>

                                        <div className="p-8">
                                            {/* Society Actions */}
                                            <div className="flex items-center gap-4 mb-8">
                                                {!user && (
                                                    <button
                                                        onClick={() => signIn('google')}
                                                        className="flex items-center gap-2 px-4 py-2 bg-ieee-blue text-white rounded-lg hover:bg-ieee-light-blue transition-colors text-sm"
                                                    >
                                                        Sign in to register
                                                    </button>
                                                )}
                                            </div>

                                            {/* Events */}
                                            <div className="mb-8">
                                                <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                                                    <Calendar className="w-5 h-5 text-ieee-blue" />
                                                    Upcoming Events
                                                </h3>
                                                {events[(selectedSociety.id || selectedSociety.$id) as string]?.length > 0 ? (
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                                        {(events[(selectedSociety.id || selectedSociety.$id) as string] || []).map((evt) => (
                                                            <EventCard key={evt.$id} event={{ ...evt, society: selectedSociety }} />
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-gray-400 text-sm">No upcoming events</p>
                                                )}
                                            </div>

                                            {/* Members Grid */}
                                            <div>
                                                <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                                                    <Users className="w-5 h-5 text-ieee-blue" />
                                                    Members
                                                </h3>
                                                {members[selectedSociety.slug]?.length > 0 ? (
                                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                                        {members[selectedSociety.slug].map((member) => (
                                                            <div
                                                                key={member.slNo}
                                                                className="bg-gray-50 rounded-xl p-4 text-center hover:shadow-md transition-shadow"
                                                            >
                                                                <div className="w-16 h-16 mx-auto rounded-full bg-gray-200 overflow-hidden mb-3">
                                                                    {member.photoUrl ? (
                                                                        <Image
                                                                            src={getExecomPhoto(member)}
                                                                            alt={member.name}
                                                                            width={64}
                                                                            height={64}
                                                                            className="w-full h-full object-cover"
                                                                        />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center text-gray-400 font-bold text-lg">
                                                                            {member.name.charAt(0)}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <p className="text-sm font-semibold text-gray-800 truncate">{member.name}</p>
                                                                <p className="text-xs text-gray-500 truncate">{member.position}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-gray-400 text-sm">No members listed</p>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </>
                    )}
                </div>
            </main>
            <Footer />
        </>
    );
}
