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
import { createPB, buildFileUrl } from "@/lib/pb";
import { getField, getExpand } from "@/lib/safe-get";

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
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (initialEvents.length > 0) {
      setSelfEvents(initialEvents);
      return;
    }

    let cancelled = false;
    setFetching(true);

    const pb = createPB();

    pb.collection("events")
      .getList(1, 100, {
        filter: 'status="published"',
        sort: "date",
        expand: "society",
        skipTotal: true,
        fields: "id,title,description,date,endDate,venue,price,banner,status,registrationOpen,maxCapacity,registeredCount,externalFormUrl,collectIeeeMember",
      })
      .then((result) => {
        if (cancelled) return;
        const items: EventWithSociety[] = (result.items || []).map(
          (raw: Record<string, unknown>) => {
            const expand = getExpand(raw);
            const societyRaw =
              raw.society && typeof raw.society === "object"
                ? raw.society
                : expand?.society;
            const society = societyRaw
              ? {
                  id: getField(societyRaw, "id", ""),
                  name: getField(societyRaw, "name", ""),
                  slug: getField(societyRaw, "slug", ""),
                  logoUrl: getField(societyRaw, "logo", "")
                    ? buildFileUrl(
                        "societies",
                        getField(societyRaw, "id", ""),
                        getField(societyRaw, "logo", ""),
                      )
                    : "",
                }
              : undefined;
            const price = Number(getField(raw, "price", 0)) || 0;
            return {
              id: getField(raw, "id", ""),
              createdAt: getField(raw, "created", ""),
              updatedAt: getField(raw, "updated", ""),
              title: getField(raw, "title", ""),
              description: getField(raw, "description", ""),
              date: getField(raw, "date", ""),
              endDate: getField(raw, "endDate", ""),
              venue: getField(raw, "venue", ""),
              price,
              isPaid: price > 0,
              bannerUrl: getField(raw, "banner", "")
                ? buildFileUrl(
                    "events",
                    getField(raw, "id", ""),
                    getField(raw, "banner", ""),
                  )
                : "",
              status: getField(raw, "status", "published"),
              registrationOpen: !!getField(
                raw,
                "registrationOpen",
                false,
              ),
              maxCapacity: getField(raw, "maxCapacity", 0),
              registeredCount: getField(raw, "registeredCount", 0),
              externalFormUrl:
                getField(raw, "externalFormUrl", "") || undefined,
              collectIeeeMember: !!getField(
                raw,
                "collectIeeeMember",
                false,
              ),
              society: society!,
            } as EventWithSociety;
          },
        );
        setSelfEvents(items);
        setFetching(false);
      })
      .catch(() => {
        if (!cancelled) setFetching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialEvents]);

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
          loading={fetching}
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
