'use client';

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
    Calendar, 
    MapPin, 
    Clock, 
    Download, 
    CheckCircle2, 
    AlertCircle,
    Ticket
} from 'lucide-react';

interface TicketCardProps {
    ticket: {
        id: string;
        qr_data?: string;
        is_scanned?: boolean;
        scanned_at?: string;
    } | null;
    event: {
        id: string;
        title: string;
        date: string;
        venue?: string;
        banner_url?: string;
    } | null;
    registration: {
        id: string;
        payment_status: string;
        registration_status: string;
    };
    variant?: 'compact' | 'full';
    onViewTicket?: () => void;
}

export function TicketCard({ ticket, event, registration, variant = 'compact', onViewTicket }: TicketCardProps) {
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [isGeneratingQR, setIsGeneratingQR] = useState(false);

    // Generate QR code
    const generateQRCode = useCallback(async () => {
        if (!ticket?.id || qrDataUrl) return;
        
        setIsGeneratingQR(true);
        try {
            const { default: QRCode } = await import('qrcode');
            const dataUrl = await QRCode.toDataURL(ticket.id, {
                width: 300,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF',
                },
            });
            setQrDataUrl(dataUrl);
        } catch (error) {
            console.error('Failed to generate QR code:', error);
        } finally {
            setIsGeneratingQR(false);
        }
    }, [ticket?.id, qrDataUrl]);

    // Generate QR on mount
    React.useEffect(() => {
        if (ticket?.id) {
            generateQRCode();
        }
    }, [ticket?.id, generateQRCode]);

    const downloadQR = () => {
        if (!qrDataUrl || !event) return;
        
        const link = document.createElement('a');
        link.download = `ticket-${event.title.replace(/\s+/g, '-').toLowerCase()}.png`;
        link.href = qrDataUrl;
        link.click();
    };

    if (!event) {
        return (
            <div className="bg-gray-100 rounded-xl p-6 text-center text-gray-500">
                Event details unavailable
            </div>
        );
    }

    const eventDate = new Date(event.date);
    const isPast = eventDate < new Date();
    const isConfirmed = registration.registration_status === 'confirmed';
    const isCheckedIn = ticket?.is_scanned;
    const isPending = registration.payment_status === 'pending';

    const getStatusBadge = () => {
        if (isCheckedIn) {
            return (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
                    <CheckCircle2 className="w-4 h-4" />
                    Checked In
                </span>
            );
        }
        if (isPast) {
            return (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600">
                    Past Event
                </span>
            );
        }
        if (isPending) {
            return (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-700">
                    <AlertCircle className="w-4 h-4" />
                    Payment Pending
                </span>
            );
        }
        if (isConfirmed) {
            return (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-ieee-blue/10 text-ieee-blue">
                    <Ticket className="w-4 h-4" />
                    Confirmed
                </span>
            );
        }
        return null;
    };

    if (variant === 'compact') {
        return (
            <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.06)] overflow-hidden ring-1 ring-black/[0.03] hover:shadow-[0_20px_40px_rgb(0,0,0,0.12)] hover:-translate-y-1 transition-all duration-300 group cursor-default"
            >
                <div className="flex flex-col sm:flex-row">
                    {/* QR Code Section */}
                    <div className="bg-gradient-to-br from-ieee-blue/90 to-blue-600/90 p-6 flex items-center justify-center sm:w-40 shrink-0 relative overflow-hidden">
                        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        {isGeneratingQR ? (
                            <div className="w-24 h-24 bg-white/20 rounded-lg animate-pulse" />
                        ) : qrDataUrl ? (
                            <div className="relative group">
                                <img 
                                    src={qrDataUrl} 
                                    alt="Ticket QR Code" 
                                    className="w-24 h-24 rounded-lg bg-white p-1"
                                />
                                <button
                                    onClick={downloadQR}
                                    className="absolute inset-0 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                >
                                    <Download className="w-6 h-6 text-white" />
                                </button>
                            </div>
                        ) : (
                            <div className="w-24 h-24 bg-white/20 rounded-lg flex items-center justify-center">
                                <Ticket className="w-8 h-8 text-white/60" />
                            </div>
                        )}
                    </div>

                    {/* Event Details Section */}
                    <div className="flex-1 p-5">
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <h3 className="font-semibold text-gray-900 text-lg line-clamp-2">
                                {event.title}
                            </h3>
                            {getStatusBadge()}
                        </div>

                        <div className="space-y-2 text-sm text-gray-600 mb-4">
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-gray-400" />
                                <span>
                                    {eventDate.toLocaleDateString('en-IN', {
                                        weekday: 'short',
                                        day: 'numeric',
                                        month: 'short',
                                        year: 'numeric',
                                    })}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-gray-400" />
                                <span>
                                    {eventDate.toLocaleTimeString('en-IN', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })}
                                </span>
                            </div>
                            {event.venue && (
                                <div className="flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-gray-400" />
                                    <span className="line-clamp-1">{event.venue}</span>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={onViewTicket}
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-ieee-blue hover:text-ieee-blue/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={!onViewTicket}
                            >
                                View Pass
                            </button>
                            {qrDataUrl && (
                                <button
                                    onClick={downloadQR}
                                    className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                                >
                                    <Download className="w-4 h-4" />
                                    Download QR
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Ticket ID Footer */}
                <div className="bg-gray-50/50 px-5 py-3 border-t border-gray-100 flex items-center justify-between text-[13px] text-gray-500 font-medium">
                    <span>Ticket ID</span>
                    <code className="font-mono bg-white shadow-sm border border-gray-200 px-2 py-0.5 rounded-md text-gray-700 tracking-tight">
                        {ticket?.id?.slice(0, 12) || registration.id.slice(0, 12)}...
                    </code>
                </div>
            </motion.div>
        );
    }

    // Full variant
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 25 }}
            className="bg-white rounded-[32px] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1),0_0_0_1px_rgba(0,0,0,0.03)] overflow-hidden max-w-md mx-auto relative group"
        >
            {/* Header */}
            <div className="relative p-8 pb-10 text-white text-center overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-ieee-blue to-ieee-light-blue z-0" />
                <div className="absolute inset-0 bg-black/10 z-0" />
                
                <div className="relative z-10">
                    <div className="flex items-center justify-center gap-2 mb-3">
                        <Ticket className="w-5 h-5 opacity-90" />
                        <span className="text-[13px] font-semibold uppercase tracking-[0.15em] opacity-90">Event Pass</span>
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight leading-tight px-4">{event.title}</h2>
                </div>
            </div>

            {/* QR Code Section */}
            <div className="pt-10 pb-6 px-8 flex flex-col items-center bg-white relative">
                {/* Visual structural cutouts */}
                <div className="absolute top-[-16px] left-[-16px] w-[32px] h-[32px] bg-gray-100 rounded-full border border-gray-200/50 shadow-[0_0_0_1px_rgba(255,255,255,1)]" />
                <div className="absolute top-[-16px] right-[-16px] w-[32px] h-[32px] bg-gray-100 rounded-full border border-gray-200/50 shadow-[0_0_0_1px_rgba(255,255,255,1)]" />
                
                {isGeneratingQR ? (
                    <div className="w-48 h-48 bg-gray-100 rounded-[20px] animate-pulse" />
                ) : qrDataUrl ? (
                    <div className="relative p-2 bg-white rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.08)] ring-1 ring-black/[0.04]">
                        <img 
                            src={qrDataUrl} 
                            alt="Ticket QR Code" 
                            className="w-44 h-44 rounded-[16px]"
                        />
                    </div>
                ) : (
                    <div className="w-48 h-48 bg-gray-100 rounded-[20px] flex items-center justify-center">
                        <Ticket className="w-12 h-12 text-gray-300" />
                    </div>
                )}
                <p className="text-gray-400 text-[13px] font-medium tracking-wide uppercase mt-6">Scan for access</p>
            </div>

            {/* Event Details */}
            <div className="p-8 space-y-6 bg-gray-50/30">
                <div className="flex items-center justify-center">
                    {getStatusBadge()}
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="bg-gray-50 rounded-xl p-4">
                        <div className="flex items-center gap-2 text-gray-500 mb-1">
                            <Calendar className="w-4 h-4" />
                            <span>Date</span>
                        </div>
                        <p className="font-semibold text-gray-900">
                            {eventDate.toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                            })}
                        </p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4">
                        <div className="flex items-center gap-2 text-gray-500 mb-1">
                            <Clock className="w-4 h-4" />
                            <span>Time</span>
                        </div>
                        <p className="font-semibold text-gray-900">
                            {eventDate.toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                            })}
                        </p>
                    </div>
                </div>

                {event.venue && (
                    <div className="bg-gray-50 rounded-xl p-4">
                        <div className="flex items-center gap-2 text-gray-500 mb-1">
                            <MapPin className="w-4 h-4" />
                            <span>Venue</span>
                        </div>
                        <p className="font-semibold text-gray-900">{event.venue}</p>
                    </div>
                )}

                {/* Actions */}
                {qrDataUrl && (
                    <button
                        onClick={downloadQR}
                        className="w-full flex items-center justify-center gap-2 bg-ieee-blue text-white py-3 rounded-xl font-semibold hover:bg-ieee-blue/90 transition-colors"
                    >
                        <Download className="w-5 h-5" />
                        Download QR Code
                    </button>
                )}
            </div>

            {/* Ticket ID Footer */}
            <div className="bg-gray-100 px-6 py-4 border-t border-gray-200">
                <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Ticket ID</span>
                    <code className="font-mono text-gray-700 bg-white px-3 py-1 rounded-lg">
                        {ticket?.id || registration.id}
                    </code>
                </div>
            </div>
        </motion.div>
    );
}

export default TicketCard;
