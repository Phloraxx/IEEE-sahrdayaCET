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
import { generateQRDataUrl, downloadQR as downloadQRFile } from "@/lib/qr-utils";
import { getTicketStatusInfo } from "@/lib/ticketStatus";
import { formatDateShort } from "@/lib/dates";
import { logError } from "@/lib/logger";

interface TicketData {
  ticket: {
    id: string;
    qrCode?: string;
    paymentStatus: string;
    registrationStatus: string;
    createdAt: string;
  } | null;
  event: {
    id: string;
    title: string;
    date: string;
    venue: string;
    bannerUrl?: string;
    time?: string;
  } | null;
  registration: {
    id: string;
    name: string;
    email: string;
    phone: string;
    registrationStatus: string;
    paymentStatus: string;
    registrationDate: string;
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
    const fetchTicket = async () => {
      try {
        const res = await fetch(`/api/ticket/${ticketId}`);
        if (!res.ok) throw new Error("Ticket not found");
        const data = await res.json();
        setTicketData(data);

        if (data.ticket) {
          const qrUrl = await generateQRDataUrl(
            `${window.location.origin}/ticket/${ticketId}`,
          );
          setQrDataUrl(qrUrl);
        }
      } catch (err: unknown) {
        logError("ticket-page", err);
        setError(
          err instanceof Error ? err.message : "Failed to load ticket",
        );
      } finally {
        setLoading(false);
      }
    };
    fetchTicket();
  }, [ticketId]);

  const handleDownloadQR = () => {
    if (qrDataUrl && ticketData) {
      try {
        const fileName = `ticket-${ticketData.registration.name.replace(/\s+/g, "-").toLowerCase()}.png`;
        downloadQRFile(qrDataUrl, fileName);
      } catch (error) {
        logError("ticket-download", error);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-ieee-blue animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading your ticket...</p>
        </div>
      </div>
    );
  }

  if (error || !ticketData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-gray-50 to-gray-100">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
            <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              {error || "Ticket Not Found"}
            </h1>
            <p className="text-gray-500 mb-6">
              The ticket you're looking for doesn't exist or has been removed.
            </p>
            <Link
              to="/events"
              className="inline-flex items-center gap-2 bg-ieee-blue text-white px-6 py-2.5 rounded-xl hover:bg-blue-700 transition-colors font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Browse Events
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { ticket, event, registration } = ticketData;
  const eventDate = event ? new Date(event.date) : new Date();
  const isPast = eventDate < new Date();
  const status = getTicketStatusInfo(
    registration.registrationStatus || registration.paymentStatus,
    isPast,
  );
  const iconMap: Record<string, React.ElementType> = {
    CheckCircle2,
    Clock,
    AlertCircle,
  };
  const StatusIcon = iconMap[status.iconName] || AlertCircle;

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100">
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Back Navigation */}
        <Link
          to="/events"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back to Events</span>
        </Link>

        {/* Ticket Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-xl border border-gray-200 overflow-hidden"
        >
          {/* Status Banner */}
          <div
            className={`px-6 py-3 flex items-center gap-3 ${status.color}`}
          >
            <StatusIcon className="w-5 h-5" />
            <span className="font-semibold text-sm">{status.text}</span>
          </div>

          {/* Event Details */}
          <div className="p-6">
            <div className="text-center mb-6">
              <Ticket className="w-12 h-12 text-ieee-blue mx-auto mb-2" />
              <h1 className="text-2xl font-bold text-gray-900">
                {event?.title || "Event Ticket"}
              </h1>
              <p className="text-gray-500 text-sm mt-1">
                Registration #{ticket?.id?.slice(-8).toUpperCase() || "N/A"}
              </p>
            </div>

            {/* Event Info */}
            <div className="bg-gray-50 rounded-2xl p-4 space-y-3 mb-6">
              {event && (
                <>
                  <div className="flex items-center gap-3 text-sm">
                    <Calendar className="w-5 h-5 text-ieee-blue" />
                    <span className="text-gray-700">
                      {formatDateShort(event.date)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="w-5 h-5 text-ieee-blue" />
                    <span className="text-gray-700">{event.venue}</span>
                  </div>
                  {event.time && (
                    <div className="flex items-center gap-3 text-sm">
                      <Clock className="w-5 h-5 text-ieee-blue" />
                      <span className="text-gray-700">{event.time}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Attendee Details */}
            <div className="space-y-2 mb-6">
              <h3 className="font-semibold text-gray-900 text-sm">
                Attendee Details
              </h3>
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Name</span>
                  <span className="text-sm font-medium text-gray-900">
                    {registration.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Email</span>
                  <span className="text-sm font-medium text-gray-900">
                    {registration.email}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Phone</span>
                  <span className="text-sm font-medium text-gray-900">
                    {registration.phone}
                  </span>
                </div>
              </div>
            </div>

            {/* QR Code */}
            {qrDataUrl && (
              <div className="text-center mb-6">
                <div className="inline-block bg-white p-4 rounded-2xl shadow-sm border border-gray-200">
                  <img
                    src={qrDataUrl}
                    alt="Event Ticket QR Code"
                    loading="lazy"
                    className="w-48 h-48 mx-auto"
                  />
                </div>
                <button
                  onClick={handleDownloadQR}
                  className="mt-3 inline-flex items-center gap-2 text-sm text-ieee-blue hover:text-blue-700 font-medium transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download QR Code
                </button>
              </div>
            )}

            {/* Registration Date */}
            <p className="text-center text-xs text-gray-400">
              Registered on{" "}
              {formatDateShort(registration.registrationDate)}
            </p>
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
