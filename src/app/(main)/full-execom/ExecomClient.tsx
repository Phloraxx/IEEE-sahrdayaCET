'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useInView } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { Users, ArrowUpRight, Linkedin, Mail, Phone, Loader2, Search, X } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

interface Member {
    name: string;
    role: string;
    tagline: string;
    image: string;
    linkedin?: string;
    email?: string;
    phone?: string;
}

const execomMembers: Member[] = [
    {
        name: 'Anil Antony',
        role: 'Branch Counselor',
        tagline: 'GUIDING LIGHT',
        image: '/Execom/anilantony.jpg',
    },
    {
        name: 'Sneha Prasanth',
        role: 'Chairperson',
        tagline: 'LEADING THE CHARGE',
        image: '/Execom/Sneha Prasanth/Sneha Prasanth.JPG',
    },
    {
        name: 'Irene Anto',
        role: 'Vice Chairperson',
        tagline: 'VISION & STRATEGY',
        image: '/Execom/Irene Anto/Irene_anto.jpg',
    },
    {
        name: 'Ameenul Irfan',
        role: 'Secretary',
        tagline: 'KEEPING IT TOGETHER',
        image: '/Execom/Ameenul Irfan_/Ameenul_irfan.jpg',
    },
    {
        name: 'Binu Ashik',
        role: 'Joint Secretary',
        tagline: 'BRIDGING THE GAP',
        image: '/Execom/Binu Ashik K/Binu_ashik.jpg',
    },
    {
        name: 'Aaron Stanphen',
        role: 'Treasurer',
        tagline: 'NUMBERS & BEYOND',
        image: '/Execom/Aaron Stanphen_/Aaron_stanphen.jpg',
    },
    {
        name: 'Sourav P Bijoy',
        role: 'Webmaster',
        tagline: 'DIGITAL ARCHITECT',
        image: '/Execom/Sourav P Bijoy/SouravPBijoy.jpg',
    },
    {
        name: 'Akhila Thomas',
        role: 'MDC',
        tagline: 'MEMBERSHIP DRIV',
        image: '/Execom/Akhila Thomas/Screenshot_20240811_185346_Gallery.jpg',
    },
    {
        name: 'Alfin Joshi P',
        role: 'ECC',
        tagline: 'ELECTRONIC & COMM',
        image: '/Execom/alfin_joshi.jpeg',
    },
    {
        name: 'Midhun P M',
        role: 'Technical Coordinator',
        tagline: 'TECH WIZARD',
        image: '/Execom/Midhun P M/IMG_20240701_173337.jpg',
    },
    {
        name: 'Angelina Victor',
        role: 'Link Rep',
        tagline: 'LINKING MINDS',
        image: '/Execom/Angelina Victor Varghese/eb65501f-0ea7-4a50-be56-0fd854318583.jpg',
    },
];

export default function ExecomClient() {
    const [members, setMembers] = useState<Member[]>(execomMembers);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const fetchContacts = async () => {
            try {
                const response = await fetch('/api/execom?limit=100');
                if (response.ok) {
                    const data = await response.json();
                    const dbDocs = (data.docs || data.execom || []) as Array<{
                        id?: string;
                        name: string;
                        linkedin?: string;
                        email?: string;
                        phone?: string;
                    }>;
                    const dbDocsMap = new Map(dbDocs.map(doc => [doc.name.toLowerCase(), doc]));

                    const updatedMembers = execomMembers.map(member => {
                        const dbMatch = dbDocsMap.get(member.name.toLowerCase());
                        if (dbMatch) {
                            return {
                                ...member,
                                linkedin: dbMatch.linkedin || member.linkedin,
                                email: dbMatch.email || member.email,
                                phone: dbMatch.phone || member.phone,
                            };
                        }
                        return member;
                    });
                    setMembers(updatedMembers);
                }
            } catch (err) {
                console.error('Failed to fetch execom contacts:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchContacts();
    }, []);

    const filteredMembers = searchQuery
        ? members.filter(m =>
            m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.role.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : members;

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
                            <Users className="w-4 h-4 text-ieee-blue" />
                            <span className="text-xs font-semibold text-ieee-blue uppercase tracking-wider">EXECOM 2026-2027</span>
                        </div>
                        <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-4 tracking-tight">
                            Full <span className="text-ieee-blue">Execom</span> Directory
                        </h1>
                        <p className="text-gray-500 max-w-2xl mx-auto text-lg">
                            Browse the complete IEEE Sahrdaya executive committee — 80+ student leaders across all societies.
                        </p>
                    </motion.div>

                    {/* Search */}
                    <div className="max-w-md mx-auto mb-12">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search by name or role..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-12 pr-10 py-3.5 bg-white border border-gray-200 rounded-2xl text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-ieee-blue focus:ring-2 focus:ring-ieee-blue/10 transition-all"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Stats */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="grid grid-cols-3 gap-4 mb-16 border-y border-gray-200 py-8 max-w-lg mx-auto"
                    >
                        <div className="text-center">
                            <div className="font-mono text-[10px] tracking-[0.3em] text-gray-400 uppercase mb-1">Roster</div>
                            <div className="font-bold text-2xl md:text-4xl text-gray-900">{loading ? '...' : members.length}</div>
                        </div>
                        <div className="text-center">
                            <div className="font-mono text-[10px] tracking-[0.3em] text-gray-400 uppercase mb-1">Events Led</div>
                            <div className="font-bold text-2xl md:text-4xl text-gray-900">100+</div>
                        </div>
                        <div className="text-center">
                            <div className="font-mono text-[10px] tracking-[0.3em] text-gray-400 uppercase mb-1">Societies</div>
                            <div className="font-bold text-2xl md:text-4xl text-gray-900">14</div>
                        </div>
                    </motion.div>

                    {/* Member Grid */}
                    {loading ? (
                        <div className="flex justify-center py-20">
                            <Loader2 className="w-10 h-10 text-ieee-blue animate-spin" />
                        </div>
                    ) : (
                        <motion.div
                            initial="hidden"
                            animate="show"
                            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
                            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6"
                        >
                            {filteredMembers.map((member, index) => (
                                <motion.div
                                    key={member.name}
                                    variants={{
                                        hidden: { opacity: 0, y: 20 },
                                        show: { opacity: 1, y: 0 },
                                    }}
                                    className="group"
                                >
                                    <div className="relative overflow-hidden rounded-xl aspect-[3/4] mb-3 bg-gray-100">
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                        <Image
                                            src={member.image}
                                            alt={member.name}
                                            fill
                                            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                                            className="object-cover transition-transform duration-[600ms] group-hover:scale-105"
                                        />
                                        <div className="absolute top-2 left-2 z-20">
                                            <span className="px-2 py-0.5 bg-white/90 backdrop-blur-sm text-[8px] font-mono tracking-[0.15em] text-gray-700 rounded-sm uppercase">
                                                {member.role}
                                            </span>
                                        </div>
                                        <div className="absolute bottom-2 right-2 z-20 opacity-20 group-hover:opacity-0 transition-opacity">
                                            <span className="font-pixel text-xl md:text-2xl text-white font-bold">
                                                {String(index + 1).padStart(2, '0')}
                                            </span>
                                        </div>
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            whileHover={{ opacity: 1, y: 0 }}
                                            className="absolute bottom-2 left-2 right-2 z-20 flex gap-1.5"
                                        >
                                            {member.linkedin && (
                                                <a href={member.linkedin} target="_blank" rel="noopener noreferrer" className="w-7 h-7 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center hover:bg-white/40 transition-colors">
                                                    <Linkedin className="w-3 h-3 text-white" />
                                                </a>
                                            )}
                                            {member.email && (
                                                <a href={`mailto:${member.email}`} className="w-7 h-7 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center hover:bg-white/40 transition-colors">
                                                    <Mail className="w-3 h-3 text-white" />
                                                </a>
                                            )}
                                            {member.phone && (
                                                <a href={`tel:${member.phone}`} className="w-7 h-7 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center hover:bg-white/40 transition-colors">
                                                    <Phone className="w-3 h-3 text-white" />
                                                </a>
                                            )}
                                        </motion.div>
                                    </div>
                                    <h4 className="font-sans font-bold text-sm md:text-base text-gray-900 tracking-tight leading-tight group-hover:text-ieee-blue transition-colors">
                                        {member.name}
                                    </h4>
                                    <p className="text-[10px] md:text-xs font-mono text-gray-500 mt-0.5 tracking-wider uppercase truncate">
                                        {member.tagline}
                                    </p>
                                </motion.div>
                            ))}
                        </motion.div>
                    )}

                    {!loading && filteredMembers.length === 0 && (
                        <div className="text-center py-20">
                            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-xl font-semibold text-gray-700 mb-2">No Members Found</h3>
                            <p className="text-gray-500">Try a different search term.</p>
                        </div>
                    )}
                </div>
            </main>

            <Footer />
        </div>
    );
}
