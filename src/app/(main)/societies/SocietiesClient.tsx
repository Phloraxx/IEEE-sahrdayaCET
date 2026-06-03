'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { Society, Event } from '@/types';
import Navbar from '@/components/Navbar';
import { GridBackground } from '@/components/GridBackground';
import { FloatingIcons } from '@/components/FloatingIcons';
import { TechnicalDetails } from '@/components/TechnicalDetails';
import { Loader2, X, Edit, Calendar, Users, Award, LogIn } from 'lucide-react';
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

// Member Card Component
const MemberCard = React.memo(({ member, idx }: { member: ExecomMember; idx: number }) => {
    const [imgError, setImgError] = useState(false);
    const imageSrc = member.photoUrl || '';

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.05 }}
            className="group bg-white border-2 border-gray-200 rounded-xl overflow-hidden hover:border-ieee-blue hover:shadow-lg transition-all duration-300"
        >
            {/* Member Photo */}
            <div className="relative aspect-[4/5] bg-gray-100 overflow-hidden">
                {imageSrc && !imgError ? (
                    <img src={imageSrc} alt={member.name} className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300" onError={() => setImgError(true)} />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                        <span className="text-3xl font-bold text-gray-300">
                            {member.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </span>
                    </div>
                )}
                
                {/* Position Badge */}
                <div className="absolute top-2 left-2">
                    <span className="text-[10px] font-bold text-white bg-ieee-blue px-2 py-1 rounded-full shadow-lg">
                        {member.position}
                    </span>
                </div>
            </div>

            {/* Member Info */}
            <div className="p-3">
                <h4 className="font-bold text-gray-900 text-sm mb-1 line-clamp-2">
                    {member.name}
                </h4>
                <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="font-medium">{member.department}</span>
                    <span>•</span>
                    <span>{member.semester}</span>
                </div>
            </div>
        </motion.div>
    );
});
MemberCard.displayName = 'MemberCard';

export default function SocietiesClient() {
    const [societies, setSocieties] = useState<Society[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedSociety, setSelectedSociety] = useState<Society | null>(null);
    const [societyEvents, setSocietyEvents] = useState<Event[]>([]);
    const [societyMembers, setSocietyMembers] = useState<ExecomMember[]>([]);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
    const [isRegisteringEvent, setIsRegisteringEvent] = useState(false);
    const [eventActionError, setEventActionError] = useState<string | null>(null);
    const [scrollPosition, setScrollPosition] = useState(0);
    const { data: session } = useSession();
    const user = session?.user;

    useEffect(() => {
        fetchSocieties();
    }, []);

    const fetchSocieties = async () => {
        try {
            const res = await fetch('/api/societies?limit=50&depth=1&sort=-id');
            const data = await res.json();
            const docs = (data.docs || []).map((d: Record<string, unknown>) => ({
                ...d,
                $id: d.id as string,
                id: d.id as number,
                logo_url: (d.logoUrl as string) || ((d.logo as Record<string, unknown>)?.url as string) || (d.logo_url as string),
            }));
            setSocieties(docs as unknown as Society[]);
        } catch (err: unknown) {
            console.error('Error fetching societies:', err);
            setError('Failed to load societies. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    const fetchSocietyEvents = async (societyId: string) => {
        setLoadingEvents(true);
        try {
            const eventsRes = await fetch(`/api/events?where[society][equals]=${societyId}&sort=-date&limit=10`);
            const eventsData = await eventsRes.json();
            const eventsDocs = (eventsData.docs || []).map((e: Record<string, unknown>) => ({
                ...e,
                $id: e.id as string,
                banner_url: (e.bannerUrl as string) || ((e.banner as Record<string, unknown>)?.url as string) || (e.banner_url as string),
            }));
            const events = (eventsDocs as unknown as Event[])
                .filter(event => 
                    event.status === 'published' || event.status === 'completed'
                );
            setSocietyEvents(events);
        } catch (err: unknown) {
            console.error('Error fetching events:', err);
        } finally {
            setLoadingEvents(false);
        }
    };

    const fetchSocietyMembers = async (societySlug: string) => {
        setLoadingMembers(true);
        try {
            const membersRes = await fetch(`/api/execom?where[sectionId][equals]=${societySlug}&sort=order&limit=50`);
            const membersData = await membersRes.json();
            const membersDocs = membersData.docs || [];
            const members = membersDocs.map((doc: any) => ({
                slNo: doc.order ?? doc.slNo ?? 0,
                name: doc.name || '',
                department: doc.department || '',
                semester: doc.batch || doc.semester || '',
                position: doc.position || '',
                photoUrl: (doc.photoUrl as string) || '',
                linkedin: doc.linkedin || '',
                instagram: doc.instagram || '',
                email: doc.email || '',
                phone: doc.phone || '',
            }));
            setSocietyMembers(members);
        } catch (err: unknown) {
            console.error('Error fetching members:', err);
            setSocietyMembers([]);
        } finally {
            setLoadingMembers(false);
        }
    };

    const handleSocietyClick = (society: Society) => {
        setSelectedSociety(society);
        setEventActionError(null);
        fetchSocietyEvents(String(society.id ?? society.$id));
        fetchSocietyMembers(society.slug);
    };

    const handleEditClick = () => {
        signIn('google');
    };

    const handleRegisterForEvent = async () => {
        if (!selectedEvent) return;
        setEventActionError(null);

        if (!selectedEvent.registration_url) {
            setEventActionError('Registration link will be added soon.');
            return;
        }

        if (!user) {
            signIn('google');
            return;
        }

        setIsRegisteringEvent(true);

        try {
            window.open(selectedEvent.registration_url, '_blank', 'noopener,noreferrer');
        } catch (err) {
            console.error('Event registration failed:', err);
            setEventActionError('Could not complete registration. Please try again.');
        } finally {
            setIsRegisteringEvent(false);
        }
    };

    const isChair = false;

    // Auto-scroll effect for events carousel
    useEffect(() => {
        if (!selectedSociety || societyEvents.length === 0) return;

        const interval = setInterval(() => {
            if (document.hidden) return;
            setScrollPosition((prev) => {
                const maxScroll = (societyEvents.length - 1) * 260; // card width + gap
                return prev >= maxScroll ? 0 : prev + 260;
            });
        }, 3000); // Auto-scroll every 3 seconds

        return () => clearInterval(interval);
    }, [selectedSociety, societyEvents]);

    return (
        <div className="relative w-full bg-white text-gray-900 font-sans min-h-screen">
            {/* Background Elements - Same as Hero */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <GridBackground />
                <FloatingIcons />
                <TechnicalDetails />
            </div>

            {/* Navbar - Hidden when society detail or event modal is active */}
            {!selectedSociety && !selectedEvent && <Navbar />}

            {/* Subtle Society Chair Sign In Button - Top Right (visible even when Appwrite user exists) */}
            {!selectedSociety && !selectedEvent && (
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 }}
                    className="fixed top-24 right-6 z-20"
                >
                    <button
                        onClick={() => signIn('google')}
                        className="bg-white/80 backdrop-blur-sm hover:bg-white border border-gray-200 hover:border-ieee-blue text-gray-700 hover:text-ieee-blue font-semibold py-2 px-4 rounded-lg transition-all shadow-md hover:shadow-lg flex items-center gap-2 text-sm"
                    >
                        <LogIn className="w-4 h-4" />
                        <span className="hidden sm:inline">Society Chair</span>
                    </button>
                </motion.div>
            )}

            {/* Main Content */}
            <div className="relative z-10 pt-32 pb-20 px-6">
                <div className="max-w-7xl mx-auto">
                    {/* Hero Title */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                        className="text-center mb-16"
                    >
                        <h1 className="font-pixel text-4xl md:text-6xl lg:text-7xl text-ieee-blue mb-4"
                            style={{ textShadow: '4px 4px 0px rgba(0,0,0,0.1)' }}>
                            SELECT YOUR SOCIETY
                        </h1>
                        <div className="flex items-center justify-center gap-6 mt-8">
                            <div className="h-px bg-gray-400 w-32 hidden sm:block" />
                            <p className="font-sans text-xs font-bold tracking-[0.4em] text-gray-600">
                                CHOOSE YOUR PATH
                            </p>
                            <div className="h-px bg-gray-400 w-32 hidden sm:block" />
                        </div>
                    </motion.div>

                    {/* Character Selection Grid */}
                    {loading ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
                            {Array.from({ length: 10 }).map((_, i) => (
                                <div key={i} className="bg-white border-2 border-gray-100 rounded-xl overflow-hidden animate-pulse">
                                    <div className="aspect-square p-6">
                                        <div className="w-full h-full bg-gray-100 rounded-lg" />
                                    </div>
                                    <div className="p-4 pt-2">
                                        <div className="h-4 bg-gray-100 rounded w-3/4 mx-auto" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : error ? (
                        <div className="text-center py-20">
                            <div className="text-6xl mb-4">⚠️</div>
                            <p className="text-red-600 text-lg">{error}</p>
                        </div>
                    ) : (
                        <motion.div 
                            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6"
                            initial="hidden"
                            animate="visible"
                            variants={{
                                hidden: {},
                                visible: {
                                    transition: {
                                        staggerChildren: 0.05
                                    }
                                }
                            }}
                        >
                            {societies.map((society) => (
                                <motion.div
                                    key={society.id ?? society.$id}
                                    variants={{
                                        hidden: { opacity: 0, scale: 0.8, y: 20 },
                                        visible: { 
                                            opacity: 1, 
                                            scale: 1, 
                                            y: 0,
                                            transition: {
                                                type: "spring",
                                                stiffness: 100,
                                                damping: 15
                                            }
                                        }
                                    }}
                                    whileHover={{ 
                                        scale: 1.05, 
                                        y: -8,
                                        transition: { duration: 0.2 }
                                    }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => handleSocietyClick(society)}
                                    className="cursor-pointer group relative"
                                >
                                    {/* Card Container */}
                                    <div className="relative bg-white border-2 border-gray-200 rounded-xl overflow-hidden shadow-lg hover:shadow-2xl hover:border-ieee-blue transition-all duration-300">
                                        {/* Gradient Overlay on Hover */}
                                        <div className="absolute inset-0 bg-gradient-to-br from-ieee-blue/0 to-purple-600/0 group-hover:from-ieee-blue/10 group-hover:to-purple-600/10 transition-all duration-300 z-0" />
                                        
                                        {/* Logo Container */}
                                        <div className="relative aspect-square p-6 flex items-center justify-center">
                                            <motion.div
                                                className="relative w-full h-full drop-shadow-lg"
                                                whileHover={{ rotate: [0, -5, 5, 0] }}
                                                transition={{ duration: 0.5 }}
                                            >
                                                {society.logo_url ? (
                                                <img src={society.logo_url} alt={society.name} className="w-full h-full object-contain" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <span className="text-4xl font-bold text-gray-300">
                                                        {society.name?.charAt(0) || '?'}
                                                    </span>
                                                </div>
                                            )}
                                            </motion.div>
                                            
                                            {/* Glow Effect */}
                                            <div className="absolute inset-0 bg-gradient-to-br from-ieee-blue/20 to-purple-600/20 opacity-0 group-hover:opacity-100 blur-2xl transition-opacity duration-300" />
                                        </div>

                                        {/* Society Name */}
                                        <div className="relative p-4 pt-2 bg-gradient-to-b from-transparent to-gray-50/50">
                                            <h3 className="text-center text-xs md:text-sm font-bold text-gray-800 line-clamp-2 group-hover:text-ieee-blue transition-colors">
                                                {society.name}
                                            </h3>
                                        </div>

                                        {/* Selection Indicator */}
                                        <motion.div 
                                            className="absolute top-2 right-2 w-3 h-3 rounded-full bg-ieee-blue opacity-0 group-hover:opacity-100"
                                            animate={{ scale: [1, 1.2, 1] }}
                                            transition={{ repeat: Infinity, duration: 1.5 }}
                                        />
                                    </div>

                                    {/* Hover Prompt */}
                                    <motion.div 
                                        className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                                        initial={{ y: -10 }}
                                        whileHover={{ y: 0 }}
                                    >
                                        <div className="bg-gray-900 text-white text-[10px] px-3 py-1 rounded-full whitespace-nowrap font-semibold">
                                            Click to view
                                        </div>
                                    </motion.div>
                                </motion.div>
                            ))}
                        </motion.div>
                    )}
                </div>
            </div>

            {/* Society Detail Panel */}
            <AnimatePresence>
                {selectedSociety && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedSociety(null)}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                        />

                        {/* Detail Panel */}
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                            className="fixed right-0 top-0 bottom-0 w-full md:w-2/3 lg:w-1/2 bg-white shadow-2xl z-50 overflow-y-auto"
                        >
                            {/* Close Button */}
                            <button
                                onClick={() => setSelectedSociety(null)}
                                className="absolute top-6 right-6 z-10 bg-gray-900 text-white p-3 rounded-full hover:bg-gray-800 transition-colors shadow-lg"
                            >
                                <X className="w-6 h-6" />
                            </button>

                            {/* Banner */}
                            <div className="relative h-64 bg-gradient-to-br from-ieee-blue to-purple-600 overflow-hidden">
                                {selectedSociety.banner_url ? (
                                    <img src={selectedSociety.banner_url} alt={selectedSociety.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="relative w-32 h-32 opacity-20">
                                            {selectedSociety.logo_url ? (
                                                <img src={selectedSociety.logo_url} alt={selectedSociety.name} className="w-full h-full object-contain" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-white/30">
                                                    {selectedSociety.name?.charAt(0) || '?'}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                
                                {/* Gradient Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-t from-white via-white/50 to-transparent" />
                            </div>

                            {/* Content */}
                            <div className="relative px-8 -mt-20">
                                {/* Logo Badge */}
                                <motion.div 
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: 'spring', delay: 0.2 }}
                                    className="inline-block bg-white rounded-2xl p-4 shadow-2xl border-4 border-white mb-6"
                                >
                                    <div className="relative w-24 h-24">
                                        {selectedSociety.logo_url ? (
                                            <img src={selectedSociety.logo_url} alt={selectedSociety.name} className="w-full h-full object-contain" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-gray-300">
                                                {selectedSociety.name?.charAt(0) || '?'}
                                            </div>
                                        )}
                                    </div>
                                </motion.div>

                                {/* Header */}
                                <div className="mb-8">
                                    <div className="flex items-start justify-between gap-4 mb-4">
                                        <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                                            {selectedSociety.name}
                                        </h2>
                                        {isChair && (
                                            <button
                                                onClick={handleEditClick}
                                                className="bg-ieee-blue hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-semibold"
                                            >
                                                <Edit className="w-4 h-4" />
                                                Edit
                                            </button>
                                        )}
                                    </div>
                                    
                                    {/* Bio */}
                                    <p className="text-gray-600 leading-relaxed text-lg">
                                        {selectedSociety.bio || 'No description available.'}
                                    </p>
                                </div>

                                {/* Stats */}
                                <div className="grid grid-cols-3 gap-4 mb-8">
                                    <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-4 text-center border border-blue-100">
                                        <Calendar className="w-6 h-6 text-ieee-blue mx-auto mb-2" />
                                        <div className="text-2xl font-bold text-gray-900">{societyEvents.length}</div>
                                        <div className="text-xs text-gray-600 font-semibold">Events</div>
                                    </div>
                                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 text-center border border-purple-100">
                                        <Users className="w-6 h-6 text-purple-600 mx-auto mb-2" />
                                        <div className="text-2xl font-bold text-gray-900">{loadingMembers ? '-' : societyMembers.length}</div>
                                        <div className="text-xs text-gray-600 font-semibold">Members</div>
                                    </div>
                                    <div className="bg-gradient-to-br from-pink-50 to-orange-50 rounded-xl p-4 text-center border border-pink-100">
                                        <Award className="w-6 h-6 text-pink-600 mx-auto mb-2" />
                                        <div className="text-2xl font-bold text-gray-900">{societyEvents.filter(e => e.status === 'completed').length}</div>
                                        <div className="text-xs text-gray-600 font-semibold">Completed</div>
                                    </div>
                                </div>

                                {/* Members Section */}
                                <div className="mb-8">
                                    <h3 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                                        <Users className="w-6 h-6 text-ieee-blue" />
                                        Team Members
                                    </h3>
                                    
                                    {loadingMembers ? (
                                        <div className="flex items-center justify-center py-12">
                                            <Loader2 className="w-8 h-8 text-ieee-blue animate-spin" />
                                        </div>
                                    ) : societyMembers.length > 0 ? (
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                            {societyMembers.map((member, idx) => (
                                                <MemberCard key={member.slNo} member={member} idx={idx} />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                                            <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                                            <p className="text-gray-600">No members found for this society</p>
                                        </div>
                                    )}
                                </div>

                                {/* Events Carousel Section */}
                                <div className="mb-8">
                                    <h3 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                                        <Calendar className="w-6 h-6 text-ieee-blue" />
                                        Events & Activities
                                    </h3>
                                    
                                    {loadingEvents ? (
                                        <div className="flex items-center justify-center py-12">
                                            <Loader2 className="w-8 h-8 text-ieee-blue animate-spin" />
                                        </div>
                                    ) : societyEvents.length > 0 ? (
                                        <div className="relative">
                                            {/* Carousel Container */}
                                            <div className="overflow-hidden rounded-xl">
                                                <motion.div 
                                                    className="flex gap-4"
                                                    animate={{ x: -scrollPosition }}
                                                    transition={{ 
                                                        type: "spring", 
                                                        stiffness: 100,
                                                        damping: 20
                                                    }}
                                                    style={{ width: `${societyEvents.length * 260}px` }}
                                                >
                                                    {societyEvents.map((event, idx) => (
                                                        <EventCard 
                                                            key={event.id ?? event.$id}
                                                            event={event}
                                                            variant="compact"
                                                            onClick={(selected) => {
                                                                setEventActionError(null);
                                                                setSelectedEvent(selected);
                                                            }}
                                                            index={idx}
                                                        />
                                                    ))}
                                                </motion.div>
                                            </div>

                                            {/* Carousel Indicators */}
                                            <div className="flex justify-center gap-2 mt-4">
                                                {societyEvents.map((_, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => setScrollPosition(idx * 260)}
                                                        className={`h-2 rounded-full transition-all ${
                                                            Math.round(scrollPosition / 260) === idx 
                                                                ? 'w-8 bg-ieee-blue' 
                                                                : 'w-2 bg-gray-300 hover:bg-gray-400'
                                                        }`}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                                            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                                            <p className="text-gray-600">No events yet</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="h-20" />
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Footer */}
            <Footer />

            {/* Event Detail Modal */}
            <AnimatePresence>
                {selectedEvent && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => {
                                setEventActionError(null);
                                setSelectedEvent(null);
                            }}
                            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
                        >
                            {/* Event Detail Card */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                                onClick={(e) => e.stopPropagation()}
                                className="relative aspect-[15/17] max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden"
                            >
                                {/* Close Button */}
                                <button
                                    onClick={() => {
                                        setEventActionError(null);
                                        setSelectedEvent(null);
                                    }}
                                    className="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors backdrop-blur-sm"
                                >
                                    <X className="w-5 h-5" />
                                </button>

                                {/* Scrollable Content */}
                                <div className="overflow-y-auto h-full">
                                    {/* Event Banner - 9:16 aspect ratio */}
                                    <div className="relative bg-gradient-to-br from-ieee-blue to-purple-600">{selectedEvent.banner_url ? (
                                            <img
                                                src={selectedEvent.banner_url}
                                                alt={selectedEvent.title}
                                                className="w-full h-full object-cover object-top"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Calendar className="w-24 h-24 text-white/30" />
                                            </div>
                                        )}
                                        
                                        {/* Gradient Overlay */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                        
                                        {/* Status Badge */}
                                        <div className="absolute top-4 left-4">
                                            <span className={`text-xs font-bold px-3 py-1.5 rounded-full shadow-lg ${
                                                selectedEvent.status === 'completed' ? 'bg-green-500 text-white' :
                                                selectedEvent.status === 'published' ? 'bg-blue-500 text-white' :
                                                'bg-gray-500 text-white'
                                            }`}>
                                                {selectedEvent.status.toUpperCase()}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Content */}
                                    <div className="p-6 md:p-8">
                                        {/* Title */}
                                        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                                            {selectedEvent.title}
                                        </h2>

                                        {/* Meta Info */}
                                        <div className="flex flex-wrap gap-4 mb-6 pb-6 border-b border-gray-200">
                                            <div className="flex items-center gap-2 text-gray-700">
                                                <Calendar className="w-5 h-5 text-ieee-blue" />
                                                <span className="font-semibold">
                                                    {new Date(selectedEvent.date).toLocaleDateString('en-US', { 
                                                        weekday: 'long',
                                                        month: 'long', 
                                                        day: 'numeric',
                                                        year: 'numeric'
                                                    })}
                                                </span>
                                            </div>
                                            
                                            {selectedEvent.venue && (
                                                <div className="flex items-center gap-2 text-gray-700">
                                                    <span className="text-ieee-blue">📍</span>
                                                    <span className="font-semibold">{selectedEvent.venue}</span>
                                                </div>
                                            )}
                                            
                                            {selectedEvent.price !== undefined && selectedEvent.price > 0 && (
                                                <div className="flex items-center gap-2 text-gray-700">
                                                    <span className="text-ieee-blue">💰</span>
                                                    <span className="font-semibold">₹{selectedEvent.price}</span>
                                                </div>
                                            )}

                                            {selectedEvent.max_capacity !== undefined && selectedEvent.max_capacity > 0 && (
                                                <div className="flex items-center gap-2 text-gray-700">
                                                    <Users className="w-5 h-5 text-ieee-blue" />
                                                    <span className="font-semibold">{selectedEvent.max_capacity} seats</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Description */}
                                        <div className="mb-6">
                                            <h3 className="text-lg font-bold text-gray-900 mb-3">About This Event</h3>
                                            <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                                                {selectedEvent.description || 'No description available.'}
                                            </p>
                                        </div>

                                        {/* Action Button */}
                                        {selectedEvent.status === 'published' && (
                                            <>
                                                <button
                                                    onClick={() => void handleRegisterForEvent()}
                                                    disabled={isRegisteringEvent}
                                                    className="w-full bg-gradient-to-r from-ieee-blue to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg hover:shadow-xl disabled:opacity-70 disabled:cursor-not-allowed"
                                                >
                                                    {isRegisteringEvent
                                                        ? 'Verifying passkey...'
                                                        : (selectedEvent.price ?? 0) > 0
                                                            ? 'Pay & Register'
                                                            : 'Register for Event'}
                                                </button>
                                                {eventActionError && (
                                                    <p className="mt-3 text-xs text-red-600" role="alert">
                                                        {eventActionError}
                                                    </p>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
