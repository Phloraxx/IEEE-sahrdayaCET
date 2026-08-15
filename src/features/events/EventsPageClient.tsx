import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRevalidator } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Search, Ticket, X } from "lucide-react";
import "@/styles/events.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { EventDetailModal, EventHeroSection, EventListSection } from "@/components/events";
import type { EventWithSociety, ExtendedEvent } from "@/types";
import { isPastEvent } from "@/lib/event-lifecycle";

const ARCHIVE_PAGE_SIZE = 10;
const ARCHIVE_FILTERS = ["all", "upcoming", "past"] as const;
type ArchiveFilter = (typeof ARCHIVE_FILTERS)[number];

interface EventsPageClientProps {
  initialEvents: EventWithSociety[];
}

function ArchiveRow({ event, onSelect, index }: { event: ExtendedEvent; onSelect: (event: ExtendedEvent) => void; index: number }) {
  const reduceMotion = useReducedMotion();
  const date = new Date(event.date);
  const societyName = typeof event.society === "object" ? event.society.name : "IEEE Sahrdaya";

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, delay: Math.min(index, 5) * 0.025 }}
      className="border-t border-black/12"
    >
      <Link
        to={`/events/${event.slug}`}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          onSelect(event);
        }}
        className="group grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-4 py-5 sm:grid-cols-[88px_minmax(0,1fr)_190px_90px] sm:gap-6 md:py-6"
      >
        <div>
          <div className="text-2xl font-semibold tracking-[-0.05em] tabular-nums text-[#111315]">{String(date.getDate()).padStart(2, "0")}</div>
          <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.15em] text-black/35">{date.toLocaleDateString("en-IN", { weekday: "short" })}</div>
        </div>
        <div className="min-w-0">
          <div className="line-clamp-2 text-lg font-semibold leading-tight tracking-[-0.025em] text-[#111315] transition group-hover:text-[#00629B] sm:text-xl">{event.title}</div>
          <div className="mt-1 truncate text-xs text-black/42 sm:hidden">{societyName}</div>
        </div>
        <div className="hidden truncate text-xs font-medium text-black/42 sm:block">{societyName}</div>
        <div className="flex items-center justify-end gap-3">
          <span className="hidden text-[9px] font-bold uppercase tracking-[0.15em] text-black/38 md:inline">{event.price > 0 ? `₹${event.price}` : "Free"}</span>
          <span className="grid h-9 w-9 place-items-center rounded-full border border-black/14 transition group-hover:border-[#00629B] group-hover:bg-[#00629B] group-hover:text-white">
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
  const archiveGroups = visibleArchiveEvents.reduce<Array<{ label: string; events: ExtendedEvent[] }>>((groups, event) => {
    const label = new Date(event.date).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    const current = groups[groups.length - 1];
    if (current?.label === label) current.events.push(event);
    else groups.push({ label, events: [event] });
    return groups;
  }, []);

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
      <Navbar mobileAlign="right" />
      <EventHeroSection upcomingCount={upcomingEvents.length} totalCount={extendedEvents.length} />

      <div className="px-5 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[1440px] pb-24 pt-20 md:pb-32 md:pt-28" id="upcoming-events">
          <EventListSection
            events={upcomingEvents}
            loading={false}
            error={null}
            onSelectEvent={(event) => setSelectedEventId(event.id)}
            onRetry={() => revalidator.revalidate()}
            title="Upcoming programme"
            emptyTitle="Nothing scheduled yet"
            emptyMessage="New events will appear here as soon as they are announced."
          />
        </div>

        <section id="event-archive" className="mx-auto max-w-[1440px] pb-28 md:pb-36">
          <div className="border-t border-black/10 pt-6">
            <div className="grid gap-8 py-10 md:grid-cols-12 md:items-end md:py-14">
              <div className="md:col-span-7">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[#00629B]">Programme index</p>
                <h2 className="text-5xl font-semibold leading-[0.94] tracking-[-0.06em] sm:text-6xl lg:text-7xl">Past, present, next.</h2>
              </div>
              <p className="max-w-md text-sm leading-relaxed text-black/50 md:col-span-4 md:col-start-9 md:text-base">
                Search the complete programme by status or society, then open any event for the full details.
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

            <div className="mt-8 space-y-12 md:mt-10 md:space-y-16">
              {archiveGroups.length > 0 ? (
                archiveGroups.map((group, groupIndex) => (
                  <section key={group.label} className="grid gap-5 md:grid-cols-[210px_minmax(0,1fr)] md:gap-10">
                    <div>
                      <div className="md:sticky md:top-40">
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/35">Month</div>
                        <h3 className="mt-2 text-3xl font-semibold leading-none tracking-[-0.055em] text-[#111315] sm:text-4xl">{group.label}</h3>
                        <div className="mt-3 text-[9px] font-bold uppercase tracking-[0.16em] text-[#00629B]">{String(group.events.length).padStart(2, "0")} listed</div>
                      </div>
                    </div>
                    <div className="border-b border-black/12">
                      {group.events.map((event, index) => (
                        <ArchiveRow key={event.id} event={event} index={groupIndex * ARCHIVE_PAGE_SIZE + index} onSelect={(item) => setSelectedEventId(item.id)} />
                      ))}
                    </div>
                  </section>
                ))
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
