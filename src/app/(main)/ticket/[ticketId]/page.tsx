"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Calendar,
  MapPin,
  Clock,
  Download,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Ticket,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { generateQRDataUrl, downloadQR as downloadQRFile } from "@/lib/qr";
import { getTicketStatusInfo } from "@/lib/ticketStatus";
import { formatDateShort, formatTime } from "@/lib/dates";
import { logError } from "@/lib/logger";

interface TicketData {
  ticket: {
    id: string;
    qr_data?: string;
    is_scanned: boolean;
    scanned_at?: string;
    createdAt: string;
  } | null;
  event: {
    id: string;
    title: string;
    description?: string;
    date: string;
    venue?: string;
    bannerUrl?: string;
  } | null;
  registration: {
    id: string;
    paymentStatus: string;
    registrationStatus: string;
    formResponses?: Record<string, unknown>;
  };
}

interface PageProps {
  ticketId: string;
}

export default function TicketPage({ ticketId }: PageProps) {
  const [ticketData, setTicketData] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTicket() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/registrations?ticketId=${ticketId}`);

        if (!response.ok) {
          setError("Failed to load ticket");
          return;
        }

        const data = await response.json();
        const reg = data.items?.[0];
        if (!reg) {
          setError("Ticket not found");
          return;
        }

        const eventData = typeof reg.event === "object" ? reg.event : null;

        setTicketData({
          ticket: reg.ticket || null,
          event: eventData
            ? {
                id: String(eventData.id),
                title: eventData.title,
                description: eventData.description,
                date: eventData.date,
                venue: eventData.venue,
                bannerUrl:
                  eventData.bannerUrl ||
                  (typeof eventData.banner === "object"
                    ? eventData.banner?.url
                    : undefined),
              }
            : null,
          registration: {
            id: String(reg.id),
            paymentStatus: reg.paymentStatus || "pending",
            registrationStatus: reg.registrationStatus || "pending",
            formResponses: reg.formResponses,
          },
        });

        // Generate QR code
        const ticketUrl = `${window.location.origin}/ticket/${ticketId}`;
        const qr = await generateQRDataUrl(ticketUrl);
        setQrDataUrl(qr);
      } catch (err) {
        logError("ticket-page", err);
        setError("Failed to load ticket");
      } finally {
        setLoading(false);
      }
    }

    fetchTicket();
  }, [ticketId]);

  const handleDownloadQR = () => {
    const ev = ticketData?.event;
    if (!qrDataUrl || !ev) return;
    downloadQRFile(
      qrDataUrl,
      `ticket-${ev.title.replace(/\s+/g, "-").toLowerCase()}.png`,
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100">
        <Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-ieee-blue animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading ticket...</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (error || !ticketData) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100">
        <Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center max-w-md mx-auto px-4">
            <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Ticket Not Found
            </h1>
            <p className="text-gray-600 mb-6">
              {error ||
                "The ticket you are looking for does not exist or has been removed."}
            </p>
            <Link
              to="/events"
              className="inline-flex items-center gap-2 bg-ieee-blue text-white px-6 py-3 rounded-xl font-semibold hover:bg-ieee-blue/90 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Events
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const { ticket, event, registration } = ticketData;
  const eventDate = event ? new Date(event.date) : new Date();
  const isPast = eventDate < new Date();
  const isConfirmed = registration.registrationStatus === "confirmed";
  const isPending = registration.paymentStatus === "pending";
  const status = getTicketStatusInfo(
    registration.registrationStatus || registration.paymentStatus,
    isPast,
  );
  const iconMap: Record<string, React.ElementType> = {
    CheckCircle2,
    Clock,
    AlertCircle,
    Ticket,
  };
  const StatusIcon = iconMap[status.iconName] || AlertCircle;

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100">
      <Navbar />

      <main className="py-12 px-4">
        <div className="max-w-lg mx-auto">
          {/* Back Link */}
          <Link
            to="/events"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Events
          </Link>

          {/* Ticket Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl shadow-2xl overflow-hidden"
          >
            {/* Header with gradient */}
            <div className="bg-linear-to-br from-ieee-blue via-blue-600 to-blue-700 p-8 text-white text-center relative overflow-hidden">
              {/* Background pattern */}
              <div className="absolute inset-0 opacity-10">
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23fff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                  }}
                />
              </div>

              <div className="relative">
                <div className="inline-flex items-center gap-2 bg-white/20 px-4 py-2 rounded-full mb-4">
                  <Ticket className="w-4 h-4" />
                  <span className="text-sm font-medium">Event Ticket</span>
                </div>
                <h1 className="text-2xl font-bold mb-2">{event?.title}</h1>
                {event?.description && (
                  <p className="text-white/80 text-sm line-clamp-2">
                    {event.description}
                  </p>
                )}
              </div>
            </div>

            {/* Status Banner */}
            <div
              className={`px-6 py-4 border-b ${status.color} flex items-center gap-3`}
            >
              <StatusIcon className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-semibold">{status.text}</p>
                <p className="text-sm opacity-80">{status.description}</p>
              </div>
            </div>

            {/* QR Code Section */}
            <div className="p-8 bg-gray-50 flex flex-col items-center">
              {qrDataUrl ? (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="relative"
                >
                  <div className="bg-white p-4 rounded-2xl shadow-lg">
                    <img
                      src={qrDataUrl}
                      alt="Ticket QR Code"
                      className="w-56 h-56"
                    />
                  </div>
                </motion.div>
              ) : (
                <div className="w-56 h-56 bg-gray-200 rounded-2xl animate-pulse" />
              )}
              <p className="text-gray-500 text-sm mt-4 text-center">
                Scan this QR at the event venue checkpoints
              </p>
              <p className="text-xs text-gray-400 mt-2 text-center">
                For security, direct ticket sharing is disabled.
              </p>
            </div>

            {/* Event Details */}
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    <Calendar className="w-4 h-4" />
                    <span>Date</span>
                  </div>
                  <p className="font-semibold text-gray-900">
                    {event && formatDateShort(event.date)}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    <Clock className="w-4 h-4" />
                    <span>Time</span>
                  </div>
                  <p className="font-semibold text-gray-900">
                    {event && formatTime(event.date)}
                  </p>
                </div>
              </div>

              {event?.venue && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    <MapPin className="w-4 h-4" />
                    <span>Venue</span>
                  </div>
                  <p className="font-semibold text-gray-900">{event.venue}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2">
                <button
                  onClick={handleDownloadQR}
                  disabled={!qrDataUrl || !isConfirmed || isPending}
                  className="w-full flex items-center justify-center gap-2 bg-ieee-blue text-white py-3.5 rounded-xl font-semibold hover:bg-ieee-blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-5 h-5" />
                  Download QR
                </button>
              </div>
            </div>

            {/* Ticket ID Footer */}
            <div className="bg-gray-100 px-6 py-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Ticket ID</span>
                <code className="font-mono text-sm text-gray-700 bg-white px-3 py-1.5 rounded-lg border border-gray-200">
                  {ticket?.id || registration.id}
                </code>
              </div>
            </div>
          </motion.div>

          {/* Additional Info */}
          <div className="mt-8 text-center text-sm text-gray-500">
            <p>
              Pro tip: Add this to calendar, keep your e-ticket saved, and fly
              through check-in.
            </p>
            <p>For any issues, contact the event organizers.</p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
