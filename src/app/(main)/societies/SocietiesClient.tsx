'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, useInView, Variants, AnimatePresence } from 'framer-motion';
import { 
    Building2, ChevronRight, ExternalLink, Users, 
    Calendar, MapPin, ArrowUpRight, Linkedin, Mail,
    Loader2, Layers, Award
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

interface Society {
    id: string;
    name: string;
    tagline?: string;
    description?: string;
    logo_url?: string;
    website_url?: string;
    linkedin_url?: string;
    email?: string;
    member_count?: number;
    events_count?: number;
    founded?: string;
    color?: string;
}

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 40 },
    show: { opacity: 1, y: 0 },
};

const stagger: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const SocietyCard: React.FC<{ society: Society; index: number }> = ({ society, index }) => {
    const [isHovered, setIsHovered] = useState(false);
    const colors = ['#00629B', '#4285F4', '#34A853', '#EA4335', '#FBBC05', '#7B1FA2', '#00897B', '#E65100'];

    return (
        <motion.div
            variants={fadeUp}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="group relative bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-1"
        >
            {/* Top Color Bar */}
            <div 
                className="h-1.5 w-full transition-all duration-500 group-hover:h-2"
                style={{ backgroundColor: colors[index % colors.length] }}
            />
            
            <div className="p-6 sm:p-8">
                {/* Logo and Name */}
                <div className="flex items-start gap-4 mb-5">
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-gray-50 flex-shrink-0 border border-gray-100">
                        {society.logo_url ? (
                            <Image 
                                src={society.logo_url} 
                                alt={society.name}
                                fill
                                className="object-contain p-2"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <Building2 className="w-6 h-6 text-gray-400" />
                            </div>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold text-gray-900 truncate">{society.name}</h3>
                        {society.tagline && (
                            <p className="text-sm text-gray-500 truncate">{society.tagline}</p>
                        )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-1 transition-all flex-shrink-0" />
                </div>

                {/* Description */}
                {society.description && (
                    <p className="text-sm text-gray-600 leading-relaxed mb-5 line-clamp-3">
                        {society.description}
                    </p>
                )}

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-gray-500 mb-5">
                    {society.member_count && (
                        <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {society.member_count} members
                        </span>
                    )}
                    {society.events_count && (
                        <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {society.events_count} events
                        </span>
                    )}
                    {society.founded && (
                        <span className="flex items-center gap-1">
                            <Award className="w-3.5 h-3.5" />
                            Est. {society.founded}
                        </span>
                    )}
                </div>

                {/* Links */}
                <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
                    {society.website_url && (
                        <a
                            href={society.website_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg bg-gray-50 hover:bg-ieee-blue/5 text-gray-400 hover:text-ieee-blue transition-colors"
                        >
                            <ExternalLink className="w-4 h-4" />
                        </a>
                    )}
                    {society.linkedin_url && (
                        <a
                            href={society.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg bg-gray-50 hover:bg-ieee-blue/5 text-gray-400 hover:text-ieee-blue transition-colors"
                        >
                            <Linkedin className="w-4 h-4" />
                        </a>
                    )}
                    {society.email && (
                        <a
                            href={`mailto:${society.email}`}
                            className="p-2 rounded-lg bg-gray-50 hover:bg-ieee-blue/5 text-gray-400 hover:text-ieee-blue transition-colors"
                        >
                            <Mail className="w-4 h-4" />
                        </a>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export default function SocietiesClient() {
    const [societies, setSocieties] = useState<Society[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedSociety, setSelectedSociety] = useState<Society | null>(null);

    useEffect(() => {
        const fetchSocieties = async () => {
            try {
                setLoading(true);
                const response = await fetch('/api/societies?limit=50');
                if (!response.ok) throw new Error('Failed to fetch societies');
                const data = await response.json();
                const list = (data.docs || data.societies || []).map((doc: Record<string, unknown>) => ({
                    id: (doc.id || doc.$id) as string,
                    name: doc.name as string,
                    tagline: doc.tagline as string,
                    description: doc.description as string,
                    logo_url: doc.logo_url as string,
                    website_url: doc.website_url as string,
                    linkedin_url: doc.linkedin_url as string,
                    email: doc.email as string,
                    member_count: doc.member_count as number,
                    events_count: doc.events_count as number,
                    founded: doc.founded as string,
                }));
                setSocieties(list);
            } catch (err) {
                console.error('Failed to fetch societies:', err);
                setError('Unable to load societies. Please try again.');
            } finally {
                setLoading(false);
            }
        };
        fetchSocieties();
    }, []);

    return (
        <div className="min-h-screen bg-gray-50">
            <Navbar />

            <main className="pt-32 pb-20 px-4">
                <div className="max-w-7xl mx-auto">
                    {/* Header */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-center mb-16"
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-ieee-blue/5 rounded-full mb-6">
                            <Layers className="w-4 h-4 text-ieee-blue" />
                            <span className="text-xs font-semibold text-ieee-blue uppercase tracking-wider">Our Technical Societies</span>
                        </div>
                        <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-4 tracking-tight">
                            Explore Our <span className="text-ieee-blue">Societies</span>
                        </h1>
                        <p className="text-gray-500 max-w-2xl mx-auto text-lg">
                            IEEE Sahrdaya hosts multiple technical societies, each driving innovation in their domain.
                        </p>
                    </motion.div>

                    {/* Loading */}
                    {loading && (
                        <div className="flex justify-center py-20">
                            <Loader2 className="w-10 h-10 text-ieee-blue animate-spin" />
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="text-center py-20">
                            <p className="text-red-500 mb-4">{error}</p>
                            <button
                                onClick={() => window.location.reload()}
                                className="bg-ieee-blue text-white px-6 py-2 rounded-lg font-medium hover:bg-ieee-blue/90"
                            >
                                Retry
                            </button>
                        </div>
                    )}

                    {/* Societies Grid */}
                    {!loading && !error && (
                        <motion.div
                            variants={stagger}
                            initial="hidden"
                            animate="show"
                            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                        >
                            {societies.map((society, index) => (
                                <SocietyCard key={society.id} society={society} index={index} />
                            ))}
                        </motion.div>
                    )}

                    {!loading && !error && societies.length === 0 && (
                        <div className="text-center py-20">
                            <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-xl font-semibold text-gray-700 mb-2">No Societies Found</h3>
                            <p className="text-gray-500">Check back soon for our society listings.</p>
                        </div>
                    )}
                </div>
            </main>

            <Footer />
        </div>
    );
}
