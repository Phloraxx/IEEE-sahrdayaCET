'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import TransitionLink from '@/components/PageTransition/TransitionLink';
import {
    Grid,
    ArrowRight,
    Newspaper,
    Users,
    Code,
    ArrowUpRight,
    Loader2
} from 'lucide-react';
import { SocietyStrip } from './SocietyStrip';

interface LatestEvent {
    id: string;
    title: string;
    shortTitle?: string;
    description: string;
    date: string;
    banner_url?: string;
    tag?: string;
}

export const WhatsHappening: React.FC = () => {
    const [latestEvent, setLatestEvent] = useState<LatestEvent | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchLatestEvent() {
            try {
                const now = new Date().toISOString();
                const response = await fetch(`/api/events?where[status][equals]=published&where[date][greater_than]=${now}&sort=date&limit=1`);
                
                if (!response.ok) throw new Error('Failed to fetch events');
                
                const data = await response.json();
                const docs = data.docs || data.events || [];
                
                if (docs.length > 0) {
                    const event = docs[0];
                    setLatestEvent({
                        id: event.id || event.$id,
                        title: event.title as string,
                        shortTitle: (event.short_title as string) || undefined,
                        description: (event.description as string) || 'Join us for this exciting IEEE event!',
                        date: event.date as string,
                        banner_url: (event.banner_url as string) || undefined,
                        tag: (event.event_type as string) || 'UPCOMING EVENT'
                    });
                }
            } catch (err) {
                console.error('Failed to fetch latest event:', err);
            } finally {
                setLoading(false);
            }
        }

        fetchLatestEvent();
    }, []);

    // Format date parts for display
    const getDateParts = (dateString: string) => {
        const date = new Date(dateString);
        return {
            day: date.getDate().toString().padStart(2, '0'),
            month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
            hour: date.toLocaleTimeString('en-US', { hour: '2-digit', hour12: true }).split(' ')[0],
            ampm: date.toLocaleTimeString('en-US', { hour: '2-digit', hour12: true }).split(' ')[1]
        };
    };

    const dateParts = latestEvent ? getDateParts(latestEvent.date) : null;

    return (
        <section id="events" className="container mx-auto px-4 py-20 relative z-20">
            <div className="flex items-center space-x-2 mb-8">
                <Grid className="w-5 h-5 text-ieee-blue" />
                <h3 className="font-pixel text-lg md:text-xl text-gray-800">WHAT&apos;S HAPPENING</h3>
                <div className="h-px flex-grow bg-gray-300 ml-4"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 auto-rows-min md:grid-rows-[300px_200px] gap-4">
                {/* Latest Event Card */}
                <div className="col-span-1 md:col-span-3 row-span-1 md:row-span-1 bento-card bg-white rounded-xl overflow-hidden border border-gray-200 relative group shadow-sm transition-all hover:shadow-md hover:border-ieee-blue/30 min-h-[400px] md:min-h-0">
                    <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-transparent to-transparent z-10 opacity-90"></div>
                    <div className="absolute inset-0 bg-blue-900 bg-opacity-20 z-0">
                        {loading ? (
                            <div className="w-full h-full bg-gray-200 animate-pulse" />
                        ) : (
                            <Image
                                alt={latestEvent?.title || "Upcoming Event"}
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                src="/AGM.webp"
                                fill
                                sizes="(max-width: 768px) 100vw, 75vw"
                                priority
                            />
                        )}
                    </div>
                    <div className="relative z-20 p-6 md:p-8 h-full flex flex-col justify-center text-white">
                        {loading ? (
                            <div className="flex items-center gap-2">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span className="text-sm">Loading latest event...</span>
                            </div>
                        ) : latestEvent ? (
                            <>
                                <div className="inline-block px-3 py-1 bg-ieee-blue text-white text-[10px] font-mono tracking-wider rounded-sm mb-3 w-max uppercase">
                                    {latestEvent.tag}
                                </div>
                                <h2 className="font-bold text-3xl md:text-5xl font-sans mb-2 drop-shadow-lg">
                                    {latestEvent.shortTitle || latestEvent.title.split(' ').slice(0, 4).join(' ')}
                                </h2>
                                <p className="text-gray-200 text-sm md:text-base mb-6 max-w-md line-clamp-3">
                                    {latestEvent.description}
                                </p>

                                <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-6">
                                    {dateParts && (
                                        <div className="flex space-x-4 font-mono text-sm shadow-inner bg-black/20 p-2 rounded-lg backdrop-blur-sm border border-white/10">
                                            <div className="text-center px-1">
                                                <span className="block text-2xl font-bold text-white">{dateParts.day}</span>
                                                <span className="text-[10px] text-gray-300 tracking-wider">{dateParts.month}</span>
                                            </div>
                                            <span className="text-2xl font-bold text-gray-400 pb-2">:</span>
                                            <div className="text-center px-1">
                                                <span className="block text-2xl font-bold text-white">{dateParts.hour}</span>
                                                <span className="text-[10px] text-gray-300 tracking-wider">{dateParts.ampm}</span>
                                            </div>
                                        </div>
                                    )}

                                    <TransitionLink href="/events" className="glass-btn bg-white/10 backdrop-blur-sm border border-white/20 px-6 py-2 rounded-lg text-white font-medium text-sm hover:bg-white/20 hover:scale-105 transition-all flex items-center space-x-2 group">
                                        <span>Register Now</span>
                                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </TransitionLink>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="inline-block px-3 py-1 bg-ieee-blue text-white text-[10px] font-mono tracking-wider rounded-sm mb-3 w-max">NO UPCOMING EVENTS</div>
                                <h2 className="font-bold text-3xl md:text-5xl font-sans mb-2 drop-shadow-lg">Stay Tuned!</h2>
                                <p className="text-gray-200 text-sm md:text-base mb-6 max-w-md">
                                    Check back soon for exciting upcoming events from IEEE Sahrdaya SB.
                                </p>
                                <TransitionLink href="/events" className="glass-btn bg-white/10 backdrop-blur-sm border border-white/20 px-6 py-2 rounded-lg text-white font-medium text-sm hover:bg-white/20 hover:scale-105 transition-all flex items-center space-x-2 group w-max">
                                    <span>View Past Events</span>
                                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </TransitionLink>
                            </>
                        )}
                    </div>
                </div>

                {/* Latest News Card */}
                <div className="col-span-1 md:col-span-1 row-span-1 bento-card bg-white rounded-xl border border-gray-200 p-5 flex flex-col shadow-sm transition-all hover:shadow-md hover:border-ieee-blue/30 max-h-[300px] md:max-h-none min-h-[250px] md:min-h-0">
                    <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
                        <h4 className="font-bold text-sm text-gray-800 flex items-center gap-2">
                            <Newspaper className="w-4 h-4 text-ieee-blue" />
                            LATEST NEWS
                        </h4>
                        <span className="text-[10px] font-mono text-gray-400">LIVE FEED</span>
                    </div>
                    <div className="flex-grow overflow-y-auto no-scrollbar space-y-4 pr-1">
                        <a href="https://www.ieee.org/conferences" target="_blank" rel="noopener noreferrer" className="group block">
                            <div className="flex justify-between items-baseline">
                                <span className="text-[10px] font-mono text-ieee-blue">OCT 14</span>
                                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                            </div>
                            <h5 className="text-xs font-semibold text-gray-700 leading-snug group-hover:text-ieee-blue transition-colors mt-1">
                                Call for Papers: Int&apos;l Conference on Robotics open now.
                            </h5>
                        </a>
                        <TransitionLink href="/societies#wie" className="group block">
                            <div className="flex justify-between items-baseline">
                                <span className="text-[10px] font-mono text-gray-400">OCT 10</span>
                            </div>
                            <h5 className="text-xs font-semibold text-gray-700 leading-snug group-hover:text-ieee-blue transition-colors mt-1">
                                Women in Engineering (WIE) orientation session highlights.
                            </h5>
                        </TransitionLink>
                        <TransitionLink href="/events" className="group block">
                            <div className="flex justify-between items-baseline">
                                <span className="text-[10px] font-mono text-gray-400">OCT 08</span>
                            </div>
                            <h5 className="text-xs font-semibold text-gray-700 leading-snug group-hover:text-ieee-blue transition-colors mt-1">
                                Sahrdaya SB wins Outstanding Student Branch Award!
                            </h5>
                        </TransitionLink>
                    </div>
                    <TransitionLink href="/events" className="text-[10px] text-gray-400 font-mono mt-3 text-right hover:text-ieee-blue flex items-center justify-end gap-1">
                        VIEW ARCHIVE <ArrowUpRight className="w-3 h-3" />
                    </TransitionLink>
                </div>

                {/* Society Spotlight Card */}
                <TransitionLink href="/societies" className="col-span-1 md:col-span-1 row-span-1 bento-card bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200 p-5 flex flex-col justify-between shadow-sm relative overflow-hidden group transition-all hover:shadow-md hover:border-ieee-blue/30 min-h-[250px] md:min-h-0">
                    <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-ieee-blue opacity-5 rounded-full z-0 group-hover:scale-150 transition-transform duration-500"></div>
                    <div>
                        <div className="text-[10px] font-mono text-gray-400 mb-1 uppercase tracking-wide">Society Spotlight</div>
                        <h4 className="font-bold text-xl text-gray-800 z-10 relative">Computer Society</h4>
                        <div className="w-8 h-1 bg-ieee-blue mt-2 rounded-full"></div>
                    </div>
                    <div className="flex justify-end">
                        <div className="w-16 h-16 bg-white rounded-2xl shadow-lg border border-gray-100 flex items-center justify-center transform rotate-3 group-hover:rotate-6 transition-transform">
                            <Code className="w-8 h-8 text-ieee-blue" />
                        </div>
                    </div>
                    <div className=" text-xs text-gray-500 line-clamp-2 relative z-10">
                        Advancing the theory, practice, and application of computer and info systems.
                    </div>
                </TransitionLink>

                {/* IEEE By The Numbers */}
                <div className="col-span-1 md:col-span-2 row-span-1 bento-card bg-white rounded-xl border border-gray-200 p-5 flex flex-col shadow-sm transition-all hover:shadow-md hover:border-ieee-blue/30 relative overflow-hidden group">
                    <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-ieee-blue opacity-[0.03] rounded-full z-0 group-hover:scale-150 transition-transform duration-500"></div>
                    
                    <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
                        <h4 className="font-bold text-sm text-gray-800 flex items-center gap-2">
                            <Users className="w-4 h-4 text-ieee-blue" />
                            BY THE NUMBERS
                        </h4>
                        <span className="text-[10px] font-mono text-gray-400">EST. 2012</span>
                    </div>

                    <div className="flex items-center justify-between h-full relative z-10">
                        {/* Stat 1 */}
                        <div className="flex-1 flex flex-col items-center text-center">
                            <div className="font-pixel text-2xl md:text-4xl text-gray-900  leading-none">1000<span className="text-ieee-blue">+</span></div>
                            <span className="text-[9px] font-mono text-gray-400 mt-2 tracking-[0.2em] uppercase">Members</span>
                        </div>

                        <div className="w-px h-12 bg-gray-200"></div>

                        {/* Stat 2 */}
                        <div className="flex-1 flex flex-col items-center text-center">
                            <span className="font-pixel text-2xl md:text-4xl text-gray-900 leading-none">22<span className="text-ieee-blue">+</span></span>
                            <span className="text-[9px] font-mono text-gray-400 mt-2 tracking-[0.2em] uppercase">Professionals</span>
                        </div>

                        <div className="w-px h-12 bg-gray-200"></div>

                        {/* Stat 3 */}
                        <div className="flex-1 flex flex-col items-center text-center">
                            <span className="font-pixel text-2xl md:text-4xl text-gray-900 leading-none">14</span>
                            <span className="text-[9px] font-mono text-gray-400 mt-2 tracking-[0.2em] uppercase">Years</span>
                        </div>
                    </div>
                </div>

                {/* Join Card */}
                <div className="col-span-1 md:col-span-1 row-span-1 bento-card bg-ieee-blue rounded-xl border border-blue-800 p-6 flex flex-col items-center justify-center shadow-lg relative overflow-hidden group text-center min-h-[250px] md:min-h-0">
                    <div className="absolute w-40 h-40 bg-white opacity-10 rounded-full blur-2xl -top-10 -right-10 group-hover:scale-125 transition-transform duration-700"></div>
                    <Users className="w-10 h-10 text-white mb-3 animate-bounce" />
                    <h4 className="font-bold text-white text-lg leading-tight mb-2">Join The Community</h4>
                    <p className="text-blue-100 text-xs mb-4">Be part of the world&apos;s largest technical professional organization.</p>
                    <a href="https://www.ieee.org/membership" target="_blank" rel="noopener noreferrer" className="bg-white text-ieee-blue text-xs font-bold py-2 px-6 rounded-full shadow-md hover:shadow-lg hover:scale-105 transition-all uppercase tracking-wider">
                        Join IEEE
                    </a>
                </div>
            </div>

            {/* Society Logos Marquee */}
            <SocietyStrip />
        </section>
    );
};
