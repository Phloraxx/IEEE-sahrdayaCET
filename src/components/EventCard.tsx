'use client';

import React, { memo } from 'react';
import Image from 'next/image';
import { Event, Society } from '@/types';
import { Calendar, MapPin, IndianRupee, ChevronRight, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { UrgencyTag } from './UrgencyTag';

type UrgencyType = 'early-bird' | 'last-chance' | 'hot-event' | null;

interface EventCardProps {
    event: Event & { society?: Society };
    variant?: 'default' | 'compact';
    onClick?: (event: Event) => void;
    index?: number;
    urgencyType?: UrgencyType;
}

const EventCard = memo(function EventCard({
    event,
    variant = 'default',
    onClick,
    index = 0,
    urgencyType = null,
}: EventCardProps) {
    const eventDate = new Date(event.date);
    const formattedDate = eventDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
    });
    const formattedTime = eventDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
    });
    const year = eventDate.getFullYear();

    const isCompleted = event.status === 'completed';
    const isClickable = !!onClick;

    if (variant === 'compact') {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ scale: 1.03, y: -4 }}
                onClick={() => onClick?.(event)}
                className={`flex-shrink-0 w-[240px] bg-white rounded-xl overflow-hidden border-2 border-gray-200 hover:border-ieee-blue shadow-md hover:shadow-xl transition-all group ${
                    isClickable ? 'cursor-pointer' : ''
                }`}
            >
                {/* Event Image - 9:16 aspect ratio */}
                <div className="relative aspect-[9/16] bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden">
                    {event.banner_url ? (
                        <Image
                            src={event.banner_url}
                            alt={event.title}
                            fill
                            sizes="240px"
                            className="object-cover object-center group-hover:scale-110 transition-transform duration-300"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <Calendar className="w-16 h-16 text-gray-300" />
                        </div>
                    )}

                    {/* Status Badge */}
                    <div className="absolute top-2 right-2">
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full shadow-lg ${
                            event.status === 'completed' ? 'bg-green-500 text-white' :
                            event.status === 'published' ? 'bg-blue-500 text-white' :
                            'bg-gray-500 text-white'
                        }`}>
                            {event.status}
                        </span>
                    </div>

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

                    {/* Date Badge */}
                    <div className="absolute bottom-2 left-2">
                        <div className="bg-white/90 backdrop-blur-sm rounded-lg px-3 py-1.5">
                            <div className="text-xs font-bold text-ieee-blue">
                                {formattedDate}
                            </div>
                            <div className="text-[10px] text-gray-600 font-semibold">
                                {year}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Event Info */}
                <div className="p-3">
                    <h4 className="font-bold text-gray-900 text-xs mb-2 line-clamp-2 group-hover:text-ieee-blue transition-colors">
                        {event.title}
                    </h4>

                    {isClickable && (
                        <div className="flex items-center gap-1 text-ieee-blue font-semibold text-[10px]">
                            <span>View Details</span>
                            <ChevronRight className="w-3 h-3" />
                        </div>
                    )}
                </div>
            </motion.div>
        );
    }

    // Default variant for grids - ENHANCED WITH HOVER LAYERS & BOLD TYPOGRAPHY
    return (
        <motion.div
            onClick={() => onClick?.(event)}
            whileHover={{ y: -8 }}
            className={`group relative bg-white border-2 border-gray-200 rounded-xl overflow-hidden transition-all duration-300 hover:border-ieee-light-blue hover:shadow-2xl ${
                isClickable ? 'cursor-pointer' : ''
            }`}
        >
            {/* Banner Image - 9:16 aspect ratio */}
            <div className="relative bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden">
                {event.banner_url ? (
                    <Image
                        src={event.banner_url}
                        alt={event.title}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover object-center group-hover:scale-110 transition-transform duration-300"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Calendar className="w-16 h-16 text-gray-400" />
                    </div>
                )}

                {/* Urgency Badge */}
                {urgencyType && (
                    <div className="absolute top-3 right-3">
                        <UrgencyTag type={urgencyType} />
                    </div>
                )}

                {/* Status Badge */}
                {event.status === 'completed' && (
                    <div className="absolute top-3 right-3 bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1">
                        <span>✓</span> Completed
                    </div>
                )}

                {/* Society Logo Overlay */}
                {event.society?.logo_url && (
                    <div className="absolute bottom-3 left-3 bg-white p-2 rounded-lg shadow-lg border border-gray-200">
                        <div className="relative w-8 h-8">
                            <Image
                                src={event.society.logo_url}
                                alt={event.society.name}
                                fill
                                sizes="32px"
                                className="object-contain"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="p-5 bg-white">
                {/* Society Name */}
                {event.society && (
                    <p className="text-ieee-blue text-xs font-bold mb-2 uppercase tracking-widest">
                        {event.society.name}
                    </p>
                )}

                {/* Title - BOLD, ALL-CAPS, TIGHTENED KERNING */}
                <div className="relative mb-3">
                    <h3
                        className="text-gray-900 font-bold text-lg mb-3 line-clamp-2 group-hover:text-ieee-light-blue transition-colors uppercase tracking-tighter"
                    >
                        {event.title}
                    </h3>
                    {/* Misalignment: Slight rotation on title */}
                    <div className="absolute -top-1 -right-2 w-1 h-8 bg-ieee-light-blue/30 rounded-full group-hover:bg-ieee-light-blue/60 transition-colors -rotate-3" />
                </div>

                {/* Details - LAYER 1: Always visible */}
                <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span>{formattedDate} • {formattedTime}</span>
                    </div>

                    {event.venue && (
                        <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4" />
                            <span className="line-clamp-1">{event.venue}</span>
                        </div>
                    )}
                </div>

                {/* LAYER 2: Hidden details that slide in on hover */}
                <AnimatePresence>
                    {!isCompleted && (
                        <motion.div
                            initial={{ opacity: 0, height: 0, marginTop: 0 }}
                            whileHover={{ opacity: 1, height: 'auto', marginTop: 12 }}
                            exit={{ opacity: 0, height: 0, marginTop: 0 }}
                            transition={{ duration: 0.3 }}
                            className="overflow-hidden"
                        >
                            <div className="space-y-3 pt-3 border-t border-gray-100">
                                {/* Friends Attending (Mock) */}
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    whileHover={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.1 }}
                                    className="flex items-center gap-2"
                                >
                                    <Users className="w-4 h-4 text-ieee-blue" />
                                    <span className="text-xs text-gray-600">12 friends interested</span>
                                </motion.div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* LAYER 3: CTA Button that morphs on hover */}
                {!isCompleted ? (
                    <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
                        <div className="flex items-center gap-1 text-gray-900 font-bold">
                            {event.price === 0 ? (
                                <span className="text-green-600">FREE</span>
                            ) : (
                                <>
                                    <IndianRupee className="w-4 h-4" />
                                    <span>{event.price}</span>
                                </>
                            )}
                        </div>

                        <motion.div
                            className="flex items-center gap-1 text-ieee-light-blue text-sm font-semibold group-hover:translate-x-1 group-hover:text-ieee-blue transition-all px-3 py-1.5 rounded-lg"
                            whileHover={{ backgroundColor: '#0099D6', color: '#ffffff' }}
                        >
                            <span>View</span>
                            <ChevronRight className="w-4 h-4" />
                        </motion.div>
                    </div>
                ) : (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="flex items-center justify-center gap-2 text-green-600 text-sm font-semibold">
                            <span>✓</span>
                            <span>Past Event</span>
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
});

export default EventCard;
