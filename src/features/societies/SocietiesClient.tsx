"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  X,
  Calendar,
  Users,
  Award,
  MapPin,
  CalendarDays,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { GridBackground } from "@/components/GridBackground";
import { FloatingIcons } from "@/components/FloatingIcons";
import { TechnicalDetails } from "@/components/TechnicalDetails";
import { createClientPB, buildFileUrl, escapeFilterValue } from "@/lib/pb"
import { formatDate, formatDateCompact } from "@/lib/dates";
import type { Society, ExecomMember, Event } from "@/types";
import { getField } from "@/lib/safe-get";

/* ------------------------------------------------------------------ */
/*  Inline Member card                                                 */
/* ------------------------------------------------------------------ */
const MemberCard = React.memo(
  ({ member, idx }: { member: ExecomMember; idx: number }) => {
    const [imgError, setImgError] = useState(false);
    const imageSrc =
      member.photoUrl ||
      (member.photo
        ? buildFileUrl("execom", member.id, member.photo)
        : undefined);

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: idx * 0.05 }}
        className="group bg-white border-2 border-gray-200 rounded-xl overflow-hidden hover:border-ieee-blue hover:shadow-lg transition-all duration-300"
      >
        {/* Member Photo */}
        <div className="relative aspect-[4/5] bg-gray-100 overflow-hidden">
          {imageSrc && !imgError ? (
            <img
              src={imageSrc}
              alt={member.name}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
              <span className="text-3xl font-bold text-gray-300">
                {member.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)}
              </span>
            </div>
          )}

          {/* Position Badge */}
          <div className="absolute top-2 left-2">
            <span className="text-[10px] font-bold text-white bg-ieee-blue px-2 py-1 rounded-full shadow-lg">
              {member.position}
            </span>
          </div>
        </div>

        {/* Member Info */}
        <div className="p-3">
          <h4 className="font-bold text-gray-900 text-sm mb-1 line-clamp-2">
            {member.name}
          </h4>
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span className="font-medium">{member.department}</span>
            <span>&bull;</span>
            <span>{member.batch || member.section}</span>
          </div>
        </div>
      </motion.div>
    );
  },
);
MemberCard.displayName = "MemberCard";

/* ------------------------------------------------------------------ */
/*  Inline event card for the carousel (white-panel friendly)          */
/* ------------------------------------------------------------------ */
function CarouselEventCard({
  event,
  onClick,
}: {
  event: Event;
  onClick: (e: Event) => void;
}) {
  const bannerSrc =
    event.bannerUrl ||
    (typeof event.banner === "string" && event.banner) ||
    "/AGM.webp";

  return (
    <div
      className="group shrink-0 w-[240px] bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-ieee-blue hover:shadow-md transition-all duration-300 cursor-pointer"
      onClick={() => onClick(event)}
    >
      <div className="relative h-28 overflow-hidden">
        <img
          loading="lazy"
          src={bannerSrc}
          alt={event.title}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-2 left-3 right-3">
          <h3 className="text-white font-semibold text-sm line-clamp-2">
            {event.title}
          </h3>
        </div>
      </div>
      <div className="p-3 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Calendar className="w-3 h-3" />
          <span>{formatDateCompact(event.date)}</span>
        </div>
        {event.venue && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <MapPin className="w-3 h-3" />
            <span className="truncate">{event.venue}</span>
          </div>
        )}
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs font-medium text-ieee-blue">
            {event.price > 0 ? `\u20B9${event.price}` : "Free"}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
interface SocietiesClientProps {
  societies: Society[];
}

export default function SocietiesClient({ societies }: SocietiesClientProps) {
  const [selectedSociety, setSelectedSociety] = useState<Society | null>(null);
  const [societyEvents, setSocietyEvents] = useState<Event[]>([]);
  const [societyMembers, setSocietyMembers] = useState<ExecomMember[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [eventActionError, setEventActionError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isRegisteringEvent, setIsRegisteringEvent] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [societyError, setSocietyError] = useState<string | null>(null);
  const [selfSocieties, setSelfSocieties] = useState<Society[]>(societies);
  const [fetching, setFetching] = useState(false);
  const societyPanelRef = useRef<HTMLDivElement>(null);
  const eventModalRef = useRef<HTMLDivElement>(null);

  // Body scroll lock when any modal/panel is open
  useEffect(() => {
    if (selectedSociety || selectedEvent) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedSociety, selectedEvent]);

  // Focus trap for society panel
  useEffect(() => {
    if (!selectedSociety) return;
    const panel = societyPanelRef.current;
    if (panel) {
      const focusable = panel.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable) {
        focusable.focus();
      } else {
        panel.focus();
      }
    }
  }, [selectedSociety]);

  // Focus trap for event modal
  useEffect(() => {
    if (!selectedEvent) return;
    const modal = eventModalRef.current;
    if (modal) {
      const focusable = modal.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable) {
        focusable.focus();
      } else {
        modal.focus();
      }
    }
  }, [selectedEvent]);

  /* ---------- Fetch societies if SSR returned empty ---------- */
  useEffect(() => {
    if (societies.length > 0) {
      setSelfSocieties(societies);
      return;
    }
    // SSR returned empty — fetch ourselves
    setFetching(true);
    const pb = createClientPB()
    pb.collection("societies").getList(1, 200, {
      filter: "isHidden=false",
      skipTotal: true,
      fields: "id,name,slug,bio,logo",
    })
      .then((data) => {
        const items = (data.items || []).map((s: Record<string, unknown>) => ({
          id: getField(s, "id", ""),
          name: getField(s, "name", ""),
          slug: getField(s, "slug", ""),
          bio: getField(s, "bio", undefined),
          logoUrl: s.logo
            ? buildFileUrl("societies", getField(s, "id", ""), getField(s, "logo", ""))
            : undefined,
        }));
        setSelfSocieties(items);
        setFetching(false);
      })
      .catch(() => setFetching(false));
  }, [societies]);

  /* ---------- Fetch members & events for selected society ---------- */
  const handleSocietyClick = useCallback(async (society: Society) => {
    setSelectedSociety(society);
    setEventActionError(null);
    setSocietyError(null);
    setScrollPosition(0);

    const pb = createClientPB()

    // Fetch members
    setLoadingMembers(true);
    pb.collection("execom")
      .getList(1, 50, {
        filter: `sectionId = ${escapeFilterValue(society.slug)}`,
        sort: "order",
        fields:
          "id,name,department,batch,position,sectionId,photo,linkedin,instagram",
      })
      .then((res) => {
        const members = res.items.map(
          (doc) =>
            ({
              id: getField(doc, 'id', ''),
              name: getField(doc, 'name', ''),
              department: getField(doc, 'department', ''),
              position: getField(doc, 'position', ''),
              sectionId: getField(doc, 'sectionId', ''),
              batch: getField(doc, 'batch', ''),
              photo: getField(doc, 'photo', ''),
              photoUrl: getField(doc, 'photo', '')
                ? buildFileUrl(
                    "execom",
                    getField(doc, 'id', ''),
                    getField(doc, 'photo', ''),
                  )
                : undefined,
              linkedin: getField(doc, 'linkedin', ''),
              instagram: getField(doc, 'instagram', ''),
              email: getField(doc, 'email', ''),
              phone: getField(doc, 'phone', ''),
            }) as ExecomMember,
        );
        setSocietyMembers(members);
      })
      .catch(() => setSocietyMembers([]))
      .finally(() => setLoadingMembers(false));

    // Fetch events
    setLoadingEvents(true);
    pb.collection("events")
      .getList(1, 50, {
        filter: `society = ${escapeFilterValue(society.id)}`,
        sort: "-date",
        fields:
          "id,title,description,date,endDate,venue,price,status,banner,externalFormUrl,registrationOpen",
      })
      .then((res) => {
        const events = res.items
          .filter(
            (e) =>
              getField<string>(e, 'status', '') === "published" ||
              getField<string>(e, 'status', '') === "completed",
          )
          .map(
            (e) =>
              ({
                id: getField(e, 'id', ''),
                title: getField(e, 'title', ''),
                description: getField(e, 'description', ''),
                date: getField(e, 'date', ''),
                endDate: getField(e, 'endDate', ''),
                venue: getField(e, 'venue', ''),
                price: getField(e, 'price', 0),
                status: getField(e, 'status', ''),
                bannerUrl: getField(e, 'banner', '')
                  ? buildFileUrl(
                      "events",
                      getField(e, 'id', ''),
                      getField(e, 'banner', ''),
                    )
                  : undefined,
                banner: getField(e, 'banner', ''),
                externalFormUrl: getField(e, 'externalFormUrl', ''),
                registrationOpen: getField(e, 'registrationOpen', true),
              }) as Event,
          );
        setSocietyEvents(events);
      })
      .catch(() => setSocietyEvents([]))
      .finally(() => setLoadingEvents(false));
  }, []);

  /* ---------- Auto-scroll for events carousel ---------- */
  useEffect(() => {
    if (!selectedSociety || societyEvents.length === 0) return;
    const interval = setInterval(() => {
      if (document.hidden) return;
      setScrollPosition((prev) => {
        const maxScroll = (societyEvents.length - 1) * 260;
        return prev >= maxScroll ? 0 : prev + 260;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [selectedSociety, societyEvents]);

  /* ---------- Simplified event registration ---------- */
  const handleRegisterForEvent = useCallback(() => {
    if (!selectedEvent) return;
    setEventActionError(null);

    const url =
      selectedEvent.externalFormUrl || selectedEvent.externalLink || "";
    if (!url) {
      setEventActionError("Registration link will be added soon.");
      return;
    }

    setIsRegisteringEvent(true);
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setEventActionError("Could not open registration link.");
    } finally {
      setIsRegisteringEvent(false);
    }
  }, [selectedEvent]);

  /* ---------- Error from props ---------- */
  const error = societyError;

  /* ---------- Render ---------- */
  return (
    <div className="relative w-full bg-white text-gray-900 font-sans min-h-screen">
      {/* Background Elements */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <GridBackground />
        <FloatingIcons />
        <TechnicalDetails />
      </div>

      {/* Navbar */}
      {!selectedSociety && !selectedEvent && <Navbar />}

      {/* Main Content */}
      <div className="relative z-10 pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          {/* Hero Title */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <h1
              className="font-pixel text-4xl md:text-6xl lg:text-7xl text-ieee-blue mb-4"
              style={{ textShadow: "4px 4px 0px rgba(0,0,0,0.1)" }}
            >
              SELECT YOUR SOCIETY
            </h1>
            <div className="flex items-center justify-center gap-6 mt-8">
              <div className="h-px bg-gray-400 w-32 hidden sm:block" />
              <p className="font-sans text-xs font-bold tracking-[0.4em] text-gray-600">
                CHOOSE YOUR PATH
              </p>
              <div className="h-px bg-gray-400 w-32 hidden sm:block" />
            </div>
          </motion.div>

          {/* Character Selection Grid */}
          {error ? (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">&#9888;&#65039;</div>
              <p className="text-red-600 text-lg">{error}</p>
            </div>
          ) : selfSocieties.length === 0 && fetching ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-ieee-blue animate-spin" />
            </div>
          ) : selfSocieties.length === 0 ? (
            <p className="text-center text-gray-500 py-12">
              No societies found.
            </p>
          ) : (
            <motion.div
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: {
                  transition: { staggerChildren: 0.05 },
                },
              }}
            >
              {selfSocieties.map((society) => (
                <motion.div
                  key={society.id}
                  variants={{
                    hidden: { opacity: 0, scale: 0.8, y: 20 },
                    visible: {
                      opacity: 1,
                      scale: 1,
                      y: 0,
                      transition: {
                        type: "spring",
                        stiffness: 100,
                        damping: 15,
                      },
                    },
                  }}
                  whileHover={{
                    scale: 1.05,
                    y: -8,
                    transition: { duration: 0.2 },
                  }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleSocietyClick(society)}
                  className="cursor-pointer group relative"
                >
                  {/* Card Container */}
                  <div className="relative bg-white border-2 border-gray-200 rounded-xl overflow-hidden shadow-lg hover:shadow-2xl hover:border-ieee-blue transition-all duration-300">
                    {/* Gradient Overlay on Hover */}
                    <div className="absolute inset-0 bg-gradient-to-br from-ieee-blue/0 to-purple-600/0 group-hover:from-ieee-blue/10 group-hover:to-purple-600/10 transition-all duration-300 z-0" />

                    {/* Logo Container */}
                    <div className="relative aspect-square p-6 flex items-center justify-center">
                      <motion.div
                        className="relative w-full h-full flex items-center justify-center"
                        whileHover={{ rotate: [0, -5, 5, 0] }}
                        transition={{ duration: 0.5 }}
                      >
                        {society.logoUrl ? (
                          <img
                            src={society.logoUrl}
                            alt={society.name}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                            className="w-full h-full object-contain drop-shadow-lg"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center">
                            <span className="text-2xl font-bold text-gray-400">
                              {society.name.charAt(0)}
                            </span>
                          </div>
                        )}
                      </motion.div>

                      {/* Glow Effect */}
                      <div className="absolute inset-0 bg-gradient-to-br from-ieee-blue/20 to-purple-600/20 opacity-0 group-hover:opacity-100 blur-2xl transition-opacity duration-300" />
                    </div>

                    {/* Society Name */}
                    <div className="relative p-4 pt-2 bg-gradient-to-b from-transparent to-gray-50/50">
                      <h3 className="text-center text-xs md:text-sm font-bold text-gray-800 line-clamp-2 group-hover:text-ieee-blue transition-colors">
                        {society.name}
                      </h3>
                    </div>

                    {/* Selection Indicator */}
                    <motion.div
                      className="absolute top-2 right-2 w-3 h-3 rounded-full bg-ieee-blue opacity-0 group-hover:opacity-100"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                    />
                  </div>

                  {/* Hover Prompt */}
                  <motion.div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-gray-900 text-white text-[10px] px-3 py-1 rounded-full whitespace-nowrap font-semibold">
                      Click to view
                    </div>
                  </motion.div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </div>

      {/* Society Detail Panel */}
      <AnimatePresence>
        {selectedSociety && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedSociety(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />

            {/* Detail Panel */}
            <motion.div
              ref={societyPanelRef}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 w-full md:w-2/3 lg:w-1/2 bg-white shadow-2xl z-50 overflow-y-auto"
              onKeyDown={(e) => { if (e.key === 'Escape') setSelectedSociety(null); }}
              role="dialog"
              aria-modal="true"
              aria-label={selectedSociety?.name || 'Society details'}
              tabIndex={-1}
            >
              {/* Close Button */}
              <button
                onClick={() => setSelectedSociety(null)}
                className="absolute top-6 right-6 z-10 bg-gray-900 text-white p-3 rounded-full hover:bg-gray-800 transition-colors shadow-lg"
              >
                <X className="w-6 h-6" />
              </button>

              {/* Banner */}
              <div className="relative h-64 bg-gradient-to-br from-ieee-blue to-purple-600 overflow-hidden">
                {selectedSociety.bannerUrl ? (
                  <img
                    src={selectedSociety.bannerUrl}
                    alt={selectedSociety.name}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : selectedSociety.logoUrl ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <img
                      src={selectedSociety.logoUrl}
                      alt={selectedSociety.name}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      className="w-32 h-32 object-contain opacity-20"
                    />
                  </div>
                ) : null}

                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-white via-white/50 to-transparent" />
              </div>

              {/* Content */}
              <div className="relative px-8 -mt-20">
                {/* Logo Badge */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="inline-block bg-white rounded-2xl p-4 shadow-2xl border-4 border-white mb-6"
                >
                  <div className="relative w-24 h-24 flex items-center justify-center">
                    {selectedSociety.logoUrl ? (
                      <img
                        src={selectedSociety.logoUrl}
                        alt={selectedSociety.name}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-xl bg-gray-100 flex items-center justify-center">
                        <span className="text-3xl font-bold text-gray-400">
                          {selectedSociety.name.charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* Header */}
                <div className="mb-8">
                  <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                    {selectedSociety.name}
                  </h2>

                  {/* Bio */}
                  <p className="text-gray-600 leading-relaxed text-lg">
                    {selectedSociety.bio || "No description available."}
                  </p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                  <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-4 text-center border border-blue-100">
                    <Calendar className="w-6 h-6 text-ieee-blue mx-auto mb-2" />
                    <div className="text-2xl font-bold text-gray-900">
                      {societyEvents.length}
                    </div>
                    <div className="text-xs text-gray-600 font-semibold">
                      Events
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 text-center border border-purple-100">
                    <Users className="w-6 h-6 text-purple-600 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-gray-900">
                      {loadingMembers ? "-" : societyMembers.length}
                    </div>
                    <div className="text-xs text-gray-600 font-semibold">
                      Members
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-pink-50 to-orange-50 rounded-xl p-4 text-center border border-pink-100">
                    <Award className="w-6 h-6 text-pink-600 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-gray-900">
                      {
                        societyEvents.filter((e) => e.status === "completed")
                          .length
                      }
                    </div>
                    <div className="text-xs text-gray-600 font-semibold">
                      Completed
                    </div>
                  </div>
                </div>

                {/* Members Section */}
                <div className="mb-8">
                  <h3 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Users className="w-6 h-6 text-ieee-blue" />
                    Team Members
                  </h3>

                  {loadingMembers ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 text-ieee-blue animate-spin" />
                    </div>
                  ) : societyMembers.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {societyMembers.map((member, idx) => (
                        <MemberCard
                          key={member.id}
                          member={member}
                          idx={idx}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                      <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600">
                        No members found for this society
                      </p>
                    </div>
                  )}
                </div>

                {/* Events Carousel Section */}
                <div className="mb-8">
                  <h3 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Calendar className="w-6 h-6 text-ieee-blue" />
                    Events &amp; Activities
                  </h3>

                  {loadingEvents ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 text-ieee-blue animate-spin" />
                    </div>
                  ) : societyEvents.length > 0 ? (
                    <div className="relative">
                      {/* Carousel Container */}
                      <div className="overflow-hidden rounded-xl">
                        <motion.div
                          className="flex gap-4"
                          animate={{ x: -scrollPosition }}
                          transition={{
                            type: "spring",
                            stiffness: 100,
                            damping: 20,
                          }}
                        >
                          {societyEvents.map((event) => (
                            <CarouselEventCard
                              key={event.id}
                              event={event}
                              onClick={(selected) => {
                                setEventActionError(null);
                                setSelectedEvent(selected);
                              }}
                            />
                          ))}
                        </motion.div>
                      </div>

                      {/* Carousel Indicators */}
                      <div className="flex justify-center gap-2 mt-4">
                        {societyEvents.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => setScrollPosition(idx * 260)}
                            className={`h-2 rounded-full transition-all ${
                              Math.round(scrollPosition / 260) === idx
                                ? "w-8 bg-ieee-blue"
                                : "w-2 bg-gray-300 hover:bg-gray-400"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                      <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600">No events yet</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="h-20" />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
      {selectedEvent && (
            <motion.div
              ref={eventModalRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setEventActionError(null);
                setSelectedEvent(null);
              }}
              onKeyDown={(e) => { if (e.key === 'Escape') { setEventActionError(null); setSelectedEvent(null); } }}
              role="dialog"
              aria-modal="true"
              aria-label={selectedEvent?.title || 'Event details'}
              tabIndex={-1}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
            >
              {/* Event Detail Card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
                className="relative max-w-lg w-full max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden"
              >
                {/* Close Button */}
                <button
                  onClick={() => {
                    setEventActionError(null);
                    setSelectedEvent(null);
                  }}
                  className="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors backdrop-blur-sm"
                >
                  <X className="w-5 h-5" />
                </button>

                {/* Scrollable Content */}
                <div className="overflow-y-auto max-h-[90vh]">
                  {/* Event Banner */}
                  <div className="relative h-48 bg-gradient-to-br from-ieee-blue to-purple-600">
                    {(selectedEvent.bannerUrl ||
                      (typeof selectedEvent.banner === "string" &&
                        selectedEvent.banner)) && (
                      <img
                        src={
                          selectedEvent.bannerUrl ||
                          (typeof selectedEvent.banner === "string" &&
                            selectedEvent.banner) ||
                          ""
                        }
                        alt={selectedEvent.title}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        className="absolute inset-0 w-full h-full object-cover object-top"
                      />
                    )}

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

                    {/* Status Badge */}
                    <div className="absolute top-4 left-4">
                      <span
                        className={`text-xs font-bold px-3 py-1.5 rounded-full shadow-lg ${
                          selectedEvent.status === "completed"
                            ? "bg-green-500 text-white"
                            : selectedEvent.status === "published"
                              ? "bg-blue-500 text-white"
                              : "bg-gray-500 text-white"
                        }`}
                      >
                        {(selectedEvent.status || "draft").toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-6 md:p-8">
                    {/* Title */}
                    <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                      {selectedEvent.title}
                    </h2>

                    {/* Meta Info */}
                    <div className="flex flex-wrap gap-4 mb-6 pb-6 border-b border-gray-200">
                      <div className="flex items-center gap-2 text-gray-700">
                        <CalendarDays className="w-5 h-5 text-ieee-blue" />
                        <span className="font-semibold">
                          {formatDate(selectedEvent.date)}
                        </span>
                      </div>

                      {selectedEvent.venue && (
                        <div className="flex items-center gap-2 text-gray-700">
                          <MapPin className="w-5 h-5 text-ieee-blue" />
                          <span className="font-semibold">
                            {selectedEvent.venue}
                          </span>
                        </div>
                      )}

                      {selectedEvent.price > 0 && (
                        <div className="flex items-center gap-2 text-gray-700">
                          <span className="text-lg">&#x20B9;</span>
                          <span className="font-semibold">
                            {selectedEvent.price}
                          </span>
                        </div>
                      )}

                      {selectedEvent.maxCapacity !== undefined &&
                        selectedEvent.maxCapacity > 0 && (
                          <div className="flex items-center gap-2 text-gray-700">
                            <Users className="w-5 h-5 text-ieee-blue" />
                            <span className="font-semibold">
                              {selectedEvent.maxCapacity} seats
                            </span>
                          </div>
                        )}
                    </div>

                    {/* Description */}
                    {selectedEvent.description && (
                      <div className="mb-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-3">
                          About This Event
                        </h3>
                        <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                          {selectedEvent.description}
                        </p>
                      </div>
                    )}

                    {/* Action Button */}
                    {selectedEvent.status === "published" &&
                      (selectedEvent.registrationOpen !== false) && (
                        <>
                          <button
                            onClick={() => void handleRegisterForEvent()}
                            disabled={isRegisteringEvent}
                            className="w-full bg-gradient-to-r from-ieee-blue to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg hover:shadow-xl disabled:opacity-70 disabled:cursor-not-allowed"
                          >
                            {isRegisteringEvent
                              ? "Opening..."
                              : selectedEvent.price > 0
                                ? "Pay & Register"
                                : "Register for Event"}
                          </button>
                          {eventActionError && (
                            <p
                              className="mt-3 text-xs text-red-600"
                              role="alert"
                            >
                              {eventActionError}
                            </p>
                          )}
                        </>
                      )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <Footer />
    </div>
  );
}
