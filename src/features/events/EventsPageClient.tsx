"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import "@/styles/events.css";
import { AnimatePresence } from "framer-motion";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  EventHeroSection,
  EventListSection,
  EventDetailModal,
} from "@/components/events";
import type { EventWithSociety, ExtendedEvent } from "@/types";

const getEventColor = (index: number): { color: string; textColor: string } => {
  const colors = [
    { color: "bg-[#4285F4]", textColor: "text-[#4285F4]" },
    { color: "bg-[#34A853]", textColor: "text-[#34A853]" },
    { color: "bg-[#EA4335]", textColor: "text-[#EA4335]" },
    { color: "bg-[#FBBC05]", textColor: "text-[#FBBC05]" },
    { color: "bg-ieee-blue", textColor: "text-ieee-blue" },
  ];
  return colors[index % colors.length]!;
};


interface EventsPageClientProps {
  initialEvents: EventWithSociety[];
}

export default function EventsPageClient({
  initialEvents,
}: EventsPageClientProps) {
  const navigate = useNavigate();
  const router = useRouter();

  const [selectedEvent, setSelectedEvent] = useState<ExtendedEvent | null>(null);
  const [selfEvents, setSelfEvents] = useState<EventWithSociety[]>(initialEvents);

  // Client-side fallback: if loader returned empty (server function failure
  // during client-side navigation), fetch from PB REST API directly.
  useEffect(() => {
    if (selfEvents.length > 0) return;
    const pbUrl = import.meta.env.VITE_POCKETBASE_URL;
    if (!pbUrl) return;
    fetch(`${pbUrl}/api/collections/events/records?filter=(status="published")&sort=date&expand=society&perPage=20&skipTotal=true`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (!data?.items) return;
        setSelfEvents(data.items.map((raw: Record<string, unknown>) => ({
          id: raw.id as string, createdAt: raw.created as string, updatedAt: raw.updated as string,
          title: raw.title as string, description: raw.description as string,
          date: raw.date as string, endDate: raw.endDate as string,
          venue: raw.venue as string, price: Number(raw.price) || 0,
          isPaid: Number(raw.price) > 0,
          bannerUrl: raw.banner ? `/api/files/events/${raw.id}/${raw.banner}` : '',
          status: raw.status as string,
          registrationOpen: !!raw.registrationOpen,
          maxCapacity: Number(raw.maxCapacity) || 0,
          registeredCount: Number(raw.registeredCount) || 0,
          externalFormUrl: (raw.externalFormUrl as string) || undefined,
          collectIeeeMember: !!raw.collectIeeeMember,
          society: raw.expand && typeof raw.expand === 'object' && 'society' in (raw.expand as Record<string, unknown>)
            ? (() => { const s = (raw.expand as Record<string, unknown>).society as Record<string, unknown>; return {
                id: s.id as string, name: s.name as string, slug: s.slug as string,
                logoUrl: s.logo ? `/api/files/societies/${s.id}/${s.logo}` : '',
              }; })()
            : undefined,
        })));
      })
      .catch(() => {});
  }, [selfEvents.length]);

  const extendedEvents: ExtendedEvent[] = useMemo(() => {
    return selfEvents.map((event, index) => ({
      ...event,
      about: event.description || "Join us for this exciting IEEE event!",
      tags: event.society?.name || "IEEE Event",
      ...getEventColor(index),
    }));
  }, [selfEvents]);

  const handleSelectEvent = (event: ExtendedEvent) => {
    setSelectedEvent(event);
  };

  const handleRegister = (event: EventWithSociety) => {
    if (event.externalFormUrl) {
      window.open(event.externalFormUrl, "_blank");
    } else {
      navigate({ to: `/register/${event.id}` });
    }
  };

  return (
    <main className="min-h-screen text-slate-800 font-sans selection:bg-ieee-blue selection:text-white overflow-x-hidden relative bg-[#F8F9FA]">
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.02] z-50 mix-blend-overlay"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")',
        }}
      />

      <Navbar />
      <EventHeroSection />

      <section className="px-4 max-w-[1400px] mx-auto">
        <EventListSection
          events={extendedEvents}
          loading={false}
          error={null}
          onSelectEvent={handleSelectEvent}
          onRetry={() => router.invalidate()}
        />
      </section>

      <Footer />

      <AnimatePresence>
        {selectedEvent && (
          <EventDetailModal
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
            onRegister={handleRegister}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
