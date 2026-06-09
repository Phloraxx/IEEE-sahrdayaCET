'use client';

import Image from 'next/image';
import { Event, Society } from '@/types';
import { Calendar, Clock, MapPin, Users } from 'lucide-react';
import { formatDate, formatTime, formatDateCompact } from '@/lib/dates';

interface EventCardProps {
    event: Event;
    variant?: 'default' | 'compact';
    societyName?: string;
    onClick?: (event: Event) => void;
    index?: number;
}

export default function EventCard({ event, variant = 'default', societyName, onClick, index }: EventCardProps) {
    const bannerSrc = event.bannerUrl || (typeof event.banner === 'object' && event.banner?.url) || '/AGM.webp';
    const society = event.society as Society | undefined;

    if (variant === 'compact') {
        return (
            <div className="group relative bg-white/5 backdrop-blur-xs rounded-xl overflow-hidden border border-white/10 hover:border-white/20 transition-all duration-300 cursor-pointer" onClick={() => onClick?.(event)}>
                <div className="relative h-32 overflow-hidden">
                    <Image
                        src={bannerSrc}
                        alt={event.title}
                        fill
                        unoptimized
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        sizes="(max-width: 768px) 100vw, 33vw"
                    />
                    <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-2 left-3 right-3">
                        <h3 className="text-white font-semibold text-sm line-clamp-2">{event.title}</h3>
                    </div>
                </div>
                <div className="p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <Calendar className="w-3 h-3" />
                        <span>{formatDateCompact(event.date)}</span>
                    </div>
                    {event.venue && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                            <MapPin className="w-3 h-3" />
                            <span className="truncate">{event.venue}</span>
                        </div>
                    )}
                    <div className="flex items-center justify-between pt-1">
                        <span className="text-xs font-medium text-ieee-blue">
                            {event.isPaid ? `₹${event.price}` : 'Free'}
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="group relative bg-linear-to-br from-gray-900 to-gray-800 rounded-2xl overflow-hidden border border-gray-700/50 hover:border-ieee-blue/50 transition-all duration-500 hover:shadow-xl hover:shadow-ieee-blue/10">
            <div className="relative h-48 overflow-hidden">
                <Image
                    src={bannerSrc}
                    alt={event.title}
                    fill
                    unoptimized
                    className="object-cover group-hover:scale-110 transition-transform duration-700"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
                <div className="absolute inset-0 bg-linear-to-t from-gray-900 via-gray-900/40 to-transparent" />
                {(event.isPaid && event.price > 0) && (
                    <div className="absolute top-3 right-3 bg-ieee-blue text-white px-3 py-1 rounded-full text-xs font-semibold">
                        ₹{event.price}
                    </div>
                )}
                {!event.isPaid && (
                    <div className="absolute top-3 left-3 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
                        Free
                    </div>
                )}
            </div>
            <div className="p-5 space-y-4">
                <div>
                    <h3 className="text-lg font-semibold text-white group-hover:text-ieee-blue transition-colors line-clamp-2">
                        {event.title}
                    </h3>
                    {(societyName || society?.name) && (
                        <p className="text-sm text-gray-400 mt-1">{societyName || society?.name}</p>
                    )}
                </div>
                <div className="space-y-2 text-sm text-gray-400">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-ieee-blue" />
                        <span>{formatDate(event.date)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-ieee-blue" />
                        <span>{formatTime(event.date)}</span>
                    </div>
                    {event.venue && (
                        <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-ieee-blue" />
                            <span className="truncate">{event.venue}</span>
                        </div>
                    )}
                </div>
                {event.maxCapacity && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 pt-2 border-t border-gray-700/50">
                        <Users className="w-3 h-3" />
                        <span>{event.registeredCount || 0}/{event.maxCapacity} registered</span>
                    </div>
                )}
            </div>
        </div>
    );
}
