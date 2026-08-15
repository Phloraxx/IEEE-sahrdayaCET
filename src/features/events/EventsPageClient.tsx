import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRevalidator } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, CalendarDays, MapPin, Search, Ticket, X } from "lucide-react";
import "@/styles/events.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { EventBannerFallback, EventDetailModal, EventHeroSection, EventListSection } from "@/components/events";
import type { EventWithSociety, ExtendedEvent } from "@/types";
import { isPastEvent } from "@/lib/event-lifecycle";
import { resolveEventArtwork } from "@/lib/event-artwork";
import { formatDate } from "@/lib/dates";

const ARCHIVE_PAGE_SIZE = 10;
const ARCHIVE_FILTERS = ["all", "upcoming", "past"] as const;
type ArchiveFilter = (typeof ARCHIVE_FILTERS)[number];

interface EventsPageClientProps {
  initialEvents: EventWithSociety[];
}

function getEventLabel(event: ExtendedEvent) {
  const capacity = Number(event.maxCapacity || 0);
  const registered = Number(event.registeredCount || 0);
  if (capacity > 0 && registered >= capacity) return "Sold out";
  if (event.registrationOpen) return "Registration open";
  return isPastEvent(event, Date.now()) ? "Event ended" : "View event";
}

function FeaturedEvent({ event, onSelect }: { event: ExtendedEvent; onSelect: (event: ExtendedEvent) => void }) {
  const reduceMotion = useReducedMotion();
  const artwork = resolveEventArtwork(event);
  const societyName = typeof event.society === "object" ? event.society.name : "IEEE Sahrdaya";
  const label = getEventLabel(event);

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 28 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto max-w-[1440px]"
      aria-labelledby="featured-event-title"
    >
      <div className="mb-5 flex items-center justify-between border-t border-black/10 pt-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-black/45">
        <span>Next up</span>
        <span>Featured event</span>
      </div>

      <Link
        to={`/events/${event.slug}`}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          onSelect(event);
        }}
        className="group block w-full text-left"
      >
        <div className="grid overflow-hidden bg-[#111315] lg:grid-cols-[1.45fr_0.8fr]">
          <div className="event-feature-image relative min-h-[420px] overflow-hidden bg-[#dedbd4] sm:min-h-[560px] lg:min-h-[650px]">
            {artwork ? (
              <motion.img
                src={artwork.src}
                alt={event.title}
                className={`h-full w-full transition-transform duration-1000 ease-out group-hover:scale-[1.018] ${artwork.fit === "contain" ? "object-contain p-10" : "object-cover"}`}
                whileInView={reduceMotion ? undefined : { scale: [1.025, 1] }}
                viewport={{ once: true }}
                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              />
            ) : (
              <EventBannerFallback title={event.title} societyName={societyName} societySlug={typeof event.society === "object" ? event.society.slug : undefined} />
            )}
            <div className="absolute bottom-5 left-5 z-10 rounded-full bg-white/92 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#111315] backdrop-blur-md sm:bottom-7 sm:left-7">
              {label}
            </div>
          </div>

          <div className="flex min-h-[430px] flex-col justify-between p-7 text-white sm:p-10 lg:min-h-0 lg:p-12">
            <div>
              <div className="mb-8 flex items-center justify-between gap-4 border-b border-white/15 pb-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
                <span>{societyName}</span>
                <span>{event.price > 0 ? `₹${event.price}` : "Free"}</span>
              </div>
              <h2 id="featured-event-title" className="max-w-xl text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-[4.6rem]">
                {event.title}
              </h2>
            </div>

            <div>
              <div className="mb-8 space-y-3 text-sm text-white/65 sm:text-base">
                <div className="flex items-center gap-3"><CalendarDays className="h-4 w-4" />{formatDate(event.date)}</div>
                {event.venue && <div className="flex items-center gap-3"><MapPin className="h-4 w-4" />{event.venue}</div>}
              </div>
              <div className="flex items-center justify-between border-t border-white/15 pt-6">
                <span className="text-xs font-bold uppercase tracking-[0.18em]">Explore event</span>
                <span className="grid h-12 w-12 place-items-center rounded-full border border-white/25 transition duration-300 group-hover:border-[#00629B] group-hover:bg-[#00629B]">
                  <ArrowUpRight className="h-5 w-5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.section>
  );
}

function ArchiveRow({ event, onSelect, index }: { event: ExtendedEvent; onSelect: (event: ExtendedEvent) => void; index: number }) {
  const reduceMotion = useReducedMotion();
  const artwork = resolveEventArtwork(event);
  const date = new Date(event.date);
  const societyName = typeof event.society === "object" ? event.society.name : "IEEE Sahrdaya";

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.45, delay: Math.min(index, 5) * 0.035 }}
      className="border-b border-black/10"
    >
      <Link
        to={`/events/${event.slug}`}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          onSelect(event);
        }}
        className="group grid w-full grid-cols-[64px_1fr_auto] items-center gap-4 py-5 text-left sm:grid-cols-[90px_minmax(0,1fr)_160px_90px] sm:gap-6 md:py-6"
      >
      <div className="text-black/45">
        <div className="text-[10px] font-semibold uppercase tracking-[0.15em]">{date.toLocaleDateString("en-IN", { month: "short" })}</div>
        <div className="mt-0.5 text-2xl font-semibold tracking-[-0.04em] text-[#111315]">{String(date.getDate()).padStart(2, "0")}</div>
      </div>

      <div className="min-w-0 sm:flex sm:items-center sm:gap-5">
        <div className="hidden h-16 w-24 shrink-0 overflow-hidden bg-[#e5e2dc] sm:block">
          {artwork ? (
            <img src={artwork.src} alt="" loading="lazy" className={`h-full w-full transition duration-500 group-hover:scale-105 ${artwork.fit === "contain" ? "object-contain p-2" : "object-cover"}`} />
          ) : (
            <EventBannerFallback title={event.title} societyName={societyName} />
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold tracking-[-0.025em] text-[#111315] transition-colors group-hover:text-[#00629B] sm:text-xl">{event.title}</div>
          <div className="mt-1 truncate text-xs text-black/45 sm:hidden">{societyName}</div>
        </div>
      </div>

      <div className="hidden truncate text-xs font-medium text-black/45 sm:block">{societyName}</div>

      <div className="flex items-center justify-end gap-3">
        <span className="hidden text-[10px] font-bold uppercase tracking-[0.14em] text-black/45 md:inline">{event.price > 0 ? `₹${event.price}` : "Free"}</span>
        <span className="grid h-9 w-9 place-items-center rounded-full border border-black/15 transition duration-300 group-hover:border-[#00629B] group-hover:bg-[#00629B] group-hover:text-white">
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
      </Link>
    </motion.div>
  );
}

export default function EventsPageClient({ initialEvents }: EventsPageClientProps) {
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("past");
  const [archiveSociety, setArchiveSociety] = useState("All societies");
  const [visibleArchiveCount, setVisibleArchiveCount] = useState(ARCHIVE_PAGE_SIZE);

  useEffect(() => {
    const refreshLifecycle = () => {
      if (document.visibilityState === "visible") void revalidator.revalidate();
    };
    const intervalId = window.setInterval(refreshLifecycle, 60_000);
    document.addEventListener("visibilitychange", refreshLifecycle);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshLifecycle);
    };
  }, [revalidator]);

  useEffect(() => setVisibleArchiveCount(ARCHIVE_PAGE_SIZE), [archiveFilter, archiveSearch, archiveSociety]);

  const extendedEvents: ExtendedEvent[] = useMemo(
    () => initialEvents.map((event) => ({ ...event, about: event.description || "Join us for this IEEE Sahrdaya event." })),
    [initialEvents],
  );

  const selectedEvent = useMemo(
    () => selectedEventId ? extendedEvents.find((event) => event.id === selectedEventId) ?? null : null,
    [extendedEvents, selectedEventId],
  );

  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    return extendedEvents.filter((event) => !isPastEvent(event, now)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [extendedEvents]);

  const featuredEvent = upcomingEvents[0] ?? null;
  const remainingUpcomingEvents = featuredEvent ? upcomingEvents.slice(1) : upcomingEvents;

  const societyOptions = useMemo(
    () => ["All societies", ...Array.from(new Set(extendedEvents.map((event) => typeof event.society === "object" ? event.society.name?.trim() : "").filter((name): name is string => Boolean(name)))).sort((a, b) => a.localeCompare(b))],
    [extendedEvents],
  );

  const filteredArchiveEvents = useMemo(() => {
    const now = Date.now();
    const needle = archiveSearch.trim().toLowerCase();
    return extendedEvents
      .filter((event) => {
        const past = isPastEvent(event, now);
        const societyName = typeof event.society === "object" ? event.society.name : "";
        const matchesLifecycle = archiveFilter === "all" || (archiveFilter === "past" ? past : !past);
        const matchesSociety = archiveSociety === "All societies" || societyName === archiveSociety;
        const matchesSearch = !needle || [event.title, event.description, event.venue, societyName].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle));
        return matchesLifecycle && matchesSociety && matchesSearch;
      })
      .sort((a, b) => archiveFilter === "upcoming" ? new Date(a.date).getTime() - new Date(b.date).getTime() : new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [archiveFilter, archiveSearch, archiveSociety, extendedEvents]);

  const visibleArchiveEvents = filteredArchiveEvents.slice(0, visibleArchiveCount);
  const hasMoreArchiveEvents = visibleArchiveCount < filteredArchiveEvents.length;

  const handleRegister = (event: EventWithSociety) => {
    if (!event.registrationOpen) return;
    if (event.externalFormUrl) window.open(event.externalFormUrl, "_blank", "noopener,noreferrer");
    else navigate(`/register/${event.id}`);
  };

  const resetArchive = () => {
    setArchiveSearch("");
    setArchiveFilter("past");
    setArchiveSociety("All societies");
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f4f2ed] font-sans text-[#111315] selection:bg-[#00629B] selection:text-white">
      <Navbar />
      <EventHeroSection />

      <div className="px-5 sm:px-8 lg:px-12">
        {featuredEvent ? (
          <FeaturedEvent event={featuredEvent} onSelect={(event) => setSelectedEventId(event.id)} />
        ) : (
          <div className="mx-auto max-w-[1440px] border-y border-black/10 py-16 text-center text-black/50">No upcoming event has been announced yet.</div>
        )}

        <div className="mx-auto max-w-[1440px] pb-28 pt-24 md:pb-36 md:pt-32" id="upcoming-events">
          <EventListSection
            events={remainingUpcomingEvents}
            loading={false}
            error={null}
            onSelectEvent={(event) => setSelectedEventId(event.id)}
            onRetry={() => revalidator.revalidate()}
            title="Upcoming events"
            emptyTitle={featuredEvent ? "That's the full lineup for now" : "Nothing scheduled yet"}
            emptyMessage={featuredEvent ? "More events will appear here as they are announced." : "New events will appear here as soon as they are announced."}
          />
        </div>

        <section id="event-archive" className="mx-auto max-w-[1440px] pb-28 md:pb-36">
          <div className="border-t border-black/10 pt-6">
            <div className="grid gap-8 py-8 md:grid-cols-12 md:items-end md:py-12">
              <div className="md:col-span-6">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#00629B]">The archive</p>
                <h2 className="text-5xl font-semibold tracking-[-0.055em] sm:text-6xl">Explore all events</h2>
              </div>
              <p className="max-w-lg text-sm leading-relaxed text-black/50 md:col-span-5 md:col-start-8 md:text-base">
                Revisit what we have built, or find the next event worth showing up for.
              </p>
            </div>

            <div className="sticky top-20 z-20 -mx-5 border-y border-black/10 bg-[#f4f2ed]/92 px-5 py-4 backdrop-blur-xl sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="event-filter-scroll flex items-center gap-2 overflow-x-auto" aria-label="Filter events by status">
                  {ARCHIVE_FILTERS.map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setArchiveFilter(filter)}
                      aria-pressed={archiveFilter === filter}
                      className={`shrink-0 rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-[0.15em] transition ${archiveFilter === filter ? "bg-[#111315] text-white" : "border border-black/15 text-black/55 hover:border-black/35 hover:text-black"}`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <label className="relative block min-w-0 sm:w-72">
                    <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
                    <input
                      type="search"
                      value={archiveSearch}
                      onChange={(event) => setArchiveSearch(event.target.value)}
                      placeholder="Search events"
                      aria-label="Search events"
                      className="h-10 w-full border-b border-black/20 bg-transparent pl-7 pr-8 text-sm outline-none transition placeholder:text-black/35 focus:border-[#00629B]"
                    />
                    {archiveSearch && (
                      <button type="button" onClick={() => setArchiveSearch("")} aria-label="Clear search" className="absolute right-0 top-1/2 -translate-y-1/2 text-black/40 hover:text-black">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </label>

                  <select
                    value={archiveSociety}
                    onChange={(event) => setArchiveSociety(event.target.value)}
                    aria-label="Filter by society"
                    className="h-10 max-w-full border-b border-black/20 bg-transparent pr-5 text-xs font-semibold text-black/60 outline-none focus:border-[#00629B]"
                  >
                    {societyOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">
              <span>{filteredArchiveEvents.length} {filteredArchiveEvents.length === 1 ? "event" : "events"}</span>
              {(archiveSearch || archiveFilter !== "past" || archiveSociety !== "All societies") && (
                <button type="button" onClick={resetArchive} className="transition hover:text-[#00629B]">Reset</button>
              )}
            </div>

            <div className="mt-3">
              {visibleArchiveEvents.length > 0 ? (
                visibleArchiveEvents.map((event, index) => <ArchiveRow key={event.id} event={event} index={index} onSelect={(item) => setSelectedEventId(item.id)} />)
              ) : (
                <div className="grid min-h-56 place-items-center border-y border-black/10 text-center">
                  <div>
                    <Ticket className="mx-auto mb-4 h-6 w-6 text-black/30" />
                    <h3 className="text-xl font-semibold">No matching events</h3>
                    <button type="button" onClick={resetArchive} className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-[#00629B]">Clear filters</button>
                  </div>
                </div>
              )}
            </div>

            {hasMoreArchiveEvents && (
              <div className="mt-10 flex justify-center">
                <button type="button" onClick={() => setVisibleArchiveCount((count) => count + ARCHIVE_PAGE_SIZE)} className="rounded-full border border-black/20 px-6 py-3 text-[10px] font-bold uppercase tracking-[0.16em] transition hover:border-[#111315] hover:bg-[#111315] hover:text-white">
                  Show more
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      <Footer />

      <AnimatePresence>
        {selectedEvent && <EventDetailModal event={selectedEvent} onClose={() => setSelectedEventId(null)} onRegister={handleRegister} />}
      </AnimatePresence>
    </main>
  );
}
