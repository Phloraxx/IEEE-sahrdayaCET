'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Calendar, MapPin, Clock, Download, Ticket } from 'lucide-react';
import { generateQRDataUrl, downloadQR as downloadQRFile } from '@/lib/qr';
import { getTicketStatusInfo } from '@/lib/ticketStatus';
import type { Event } from '@/types';

interface TicketData {
    ticketId: string;
    eventId: string;
    eventTitle: string;
    eventDate: string;
    eventVenue?: string;
    userId: string;
    userName: string;
    userEmail: string;
    registrationId: string;
    status: 'confirmed' | 'pending' | 'cancelled' | 'checked_in';
    qrCodeData: string;
    createdAt: string;
}

interface TicketDisplayProps {
    ticket: TicketData;
    event: Event;
    onClose?: () => void;
}

export default function TicketDisplay({ ticket, event, onClose }: TicketDisplayProps) {
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [isGeneratingQR, setIsGeneratingQR] = useState(true);

    useEffect(() => {
        const generateQR = async () => {
            try {
                const dataUrl = await generateQRDataUrl(ticket.qrCodeData);
                setQrDataUrl(dataUrl);
            } catch (err) {
                console.error('Failed to generate QR:', err);
            } finally {
                setIsGeneratingQR(false);
            }
        };
        generateQR();
    }, [ticket.qrCodeData]);

    const handleDownloadQR = useCallback(() => {
        if (!qrDataUrl) return;
        downloadQRFile(qrDataUrl, `ticket-${event.title.replace(/\s+/g, '-').toLowerCase()}.png`);
    }, [qrDataUrl, event.title]);

    const eventDate = new Date(event.date);
    const isPast = eventDate < new Date();

    const status = getTicketStatusInfo(ticket.status, isPast);
    const StatusIcon = status.icon;

    return (
        <div className="flex flex-col">
            {/* QR Code Section */}
            <div className="py-8 px-6 flex flex-col items-center bg-gray-50">
                {isGeneratingQR ? (
                    <div className="w-48 h-48 bg-gray-200 rounded-2xl animate-pulse" />
                ) : qrDataUrl ? (
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white p-3 rounded-2xl shadow-lg"
                    >
                        <img src={qrDataUrl} alt="Ticket QR" className="w-44 h-44" />
                    </motion.div>
                ) : (
                    <div className="w-48 h-48 bg-gray-200 rounded-2xl flex items-center justify-center">
                        <Ticket className="w-12 h-12 text-gray-400" />
                    </div>
                )}
            </div>

            {/* Status */}
            <div className={`mx-6 mt-4 px-4 py-3 rounded-xl border ${status.color} flex items-center gap-3`}>
                <StatusIcon className="w-5 h-5 shrink-0" />
                <div>
                    <p className="font-semibold text-sm">{status.text}</p>
                </div>
            </div>

            {/* Event Details */}
            <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-xl p-3">
                        <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>Date</span>
                        </div>
                        <p className="font-semibold text-gray-900 text-sm">
                            {eventDate.toLocaleDateString('en-IN', {
                                weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                            })}
                        </p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                        <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Time</span>
                        </div>
                        <p className="font-semibold text-gray-900 text-sm">
                            {eventDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>
                </div>

                {event.venue && (
                    <div className="bg-gray-50 rounded-xl p-3">
                        <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                            <MapPin className="w-3.5 h-3.5" />
                            <span>Venue</span>
                        </div>
                        <p className="font-semibold text-gray-900 text-sm">{event.venue}</p>
                    </div>
                )}

                {/* User Info */}
                {ticket.userName && (
                    <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs text-gray-500 mb-0.5">Ticket Holder</p>
                        <p className="font-semibold text-gray-900 text-sm">{ticket.userName}</p>
                        {ticket.userEmail && (
                            <p className="text-xs text-gray-500">{ticket.userEmail}</p>
                        )}
                    </div>
                )}

                {/* Download Button */}
                {qrDataUrl && (
                    <button
                        onClick={handleDownloadQR}
                        className="w-full flex items-center justify-center gap-2 bg-ieee-blue text-white py-3.5 rounded-xl font-semibold hover:bg-ieee-blue/90 transition-colors"
                    >
                        <Download className="w-5 h-5" />
                        Download QR Code
                    </button>
                )}
            </div>

            {/* Footer */}
            <div className="bg-gray-100 px-6 py-4 border-t border-gray-200">
                <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Ticket ID</span>
                    <code className="font-mono text-xs text-gray-700 bg-white px-2 py-1 rounded border border-gray-200">
                        {ticket.ticketId.slice(0, 16)}...
                    </code>
                </div>
            </div>
        </div>
    );
}
