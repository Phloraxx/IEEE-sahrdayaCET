"use client";

import React, { useEffect, useMemo, useState } from "react";
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
import { isPastEvent } from "@/lib/event-lifecycle";

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

export default function EventsPageClient({ initialEvents }: EventsPageClientProps) {
  const navigate = useNavigate();
  const router = useRouter();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Event status and registration windows are time-dependent. Revalidate while
  // this page is open so an event automatically moves to Past Events and a
  // registration action closes/opens without requiring a manual page refresh.
  useEffect(() => {
    const refreshLifecycle = () => {
      if (document.visibilityState === "visible") {
        void router.invalidate();
      }
    };

    const intervalId = window.setInterval(refreshLifecycle, 60_000);
    document.addEventListener("visibilitychange", refreshLifecycle);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshLifecycle);
    };
  }, [router]);

  const extendedEvents: ExtendedEvent[] = useMemo(() => {
    return initialEvents.map((event, index) => ({
      ...event,
      about: event.description || "Join us for this exciting IEEE event!",
      tags: event.society?.name || "IEEE Event",
      ...getEventColor(index),
    }));
  }, [initialEvents]);

  // Resolve the selected event from the latest loader data instead of retaining
  // a stale object. This keeps an already-open modal in sync after revalidation.
  const selectedEvent = useMemo(
    () =>
      selectedEventId
        ? extendedEvents.find((event) => event.id === selectedEventId) ?? null
        : null,
    [extendedEvents, selectedEventId],
  );

  const { upcomingEvents, pastEvents } = useMemo(() => {
    const now = Date.now();
    const upcoming = extendedEvents
      .filter((event) => !isPastEvent(event, now))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const past = extendedEvents
      .filter((event) => isPastEvent(event, now))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return { upcomingEvents: upcoming, pastEvents: past };
  }, [extendedEvents]);

  const handleSelectEvent = (event: ExtendedEvent) => {
    setSelectedEventId(event.id);
  };

  const handleRegister = (event: EventWithSociety) => {
    // The server returns an effective registrationOpen flag and the page
    // periodically revalidates it as registration windows change.
    if (!event.registrationOpen) return;

    if (event.externalFormUrl) {
      window.open(event.externalFormUrl, "_blank", "noopener,noreferrer");
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
          events={upcomingEvents}
          loading={false}
          error={null}
          onSelectEvent={handleSelectEvent}
          onRetry={() => router.invalidate()}
          title="Upcoming Events"
          emptyTitle="No Upcoming Events"
          emptyMessage="Check back soon for exciting new events!"
          sectionId="events-section"
        />

        <div className="mt-24 pb-24">
          <EventListSection
            events={pastEvents}
            loading={false}
            error={null}
            onSelectEvent={handleSelectEvent}
            onRetry={() => router.invalidate()}
            title="Past Events"
            emptyTitle="No Past Events Yet"
            emptyMessage="Completed events will appear here as the branch builds its archive."
            showAnnotation={false}
            sectionId="past-events"
          />
        </div>
      </section>

      <Footer />

      <AnimatePresence>
        {selectedEvent && (
          <EventDetailModal
            event={selectedEvent}
            onClose={() => setSelectedEventId(null)}
            onRegister={handleRegister}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
