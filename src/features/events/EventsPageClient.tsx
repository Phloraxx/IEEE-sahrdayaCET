import { useEffect, useMemo, useState } from "react";
import { Link, useRevalidator } from "react-router";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Search, Ticket, X } from "lucide-react";
import "@/styles/events.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { EventListSection } from "@/components/events";
import type { EventWithSociety, ExtendedEvent } from "@/types";
import { isPastEvent } from "@/lib/event-lifecycle";
import { formatDay, formatMonthYear, formatWeekdayShort } from "@/lib/dates";

const ARCHIVE_PAGE_SIZE = 10;
const ARCHIVE_FILTERS = ["all", "upcoming", "past"] as const;
type ArchiveFilter = (typeof ARCHIVE_FILTERS)[number];

interface EventsPageClientProps {
  initialEvents: EventWithSociety[];
}

function ArchiveRow({ event, index }: { event: ExtendedEvent; index: number }) {
  const reduceMotion = useReducedMotion();
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
        className="group grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-4 px-3 py-5 transition-colors hover:bg-[#00629B]/[0.035] focus-visible:bg-[#00629B]/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00629B] sm:grid-cols-[88px_minmax(0,1fr)_190px_90px] sm:gap-6 md:px-4 md:py-6"
      >
        <div>
          <div className="text-2xl font-semibold tracking-[-0.05em] tabular-nums text-[#111315]">{formatDay(event.date)}</div>
          <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.15em] text-black/35">{formatWeekdayShort(event.date)}</div>
        </div>
        <div className="min-w-0">
          <div className="line-clamp-2 text-lg font-semibold leading-tight tracking-[-0.025em] text-[#111315] transition-colors group-hover:text-[#00629B] group-focus-visible:text-[#00629B] sm:text-xl">{event.title}</div>
          <div className="mt-1 truncate text-xs text-black/42 sm:hidden">{societyName}</div>
        </div>
        <div className="hidden truncate text-xs font-medium text-black/42 sm:block">{societyName}</div>
        <div className="flex items-center justify-end gap-3">
          <span className="hidden text-[9px] font-bold uppercase tracking-[0.15em] text-black/38 md:inline">{event.price > 0 ? `₹${event.price}` : "Free"}</span>
          <span className="grid h-10 w-10 place-items-center border border-black/14 transition group-hover:border-[#00629B] group-hover:bg-[#00629B] group-hover:text-white group-focus-visible:border-[#00629B] group-focus-visible:bg-[#00629B] group-focus-visible:text-white">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

export default function EventsPageClient({ initialEvents }: EventsPageClientProps) {
  const revalidator = useRevalidator();
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
    const label = formatMonthYear(event.date);
    const current = groups[groups.length - 1];
    if (current?.label === label) current.events.push(event);
    else groups.push({ label, events: [event] });
    return groups;
  }, []);

  const resetArchive = () => {
    setArchiveSearch("");
    setArchiveFilter("past");
    setArchiveSociety("All societies");
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f8f9fa] font-sans text-[#111315] selection:bg-[#00629B] selection:text-white">
      <Navbar mobileAlign="right" />
      <div className="px-5 pt-20 sm:px-8 md:pt-24 lg:px-12">
        <div className="mx-auto max-w-[1440px] pb-10 pt-4 md:pb-14 md:pt-6" id="upcoming-events">
          <EventListSection
            events={upcomingEvents}
            loading={false}
            error={null}
            onRetry={() => revalidator.revalidate()}
            title="Events"
            emptyTitle="Nothing scheduled yet"
            emptyMessage="New events will appear here as soon as they are announced."
          />
        </div>

        <section id="event-archive" className="mx-auto max-w-[1440px] pb-28 md:pb-36">
          <div className="border-t border-black/10">
            <div className="grid gap-4 py-5 md:grid-cols-12 md:items-end md:gap-8 md:py-6">
              <div className="md:col-span-3">
                <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#00629B]">
                  <span className="font-pixel text-[8px] text-black/35">02</span> / Full index
                </p>
                <p className="mt-2 font-mono text-[9px] font-semibold uppercase tracking-[0.15em] text-black/35">
                  {String(extendedEvents.length).padStart(2, "0")} records
                </p>
              </div>
              <div className="md:col-span-9 md:flex md:items-end md:justify-between md:gap-8">
                <h2 className="text-2xl font-semibold leading-none tracking-[-0.05em] text-[#111315] sm:text-3xl">Programme index</h2>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-black/48 md:mt-0 md:text-right">
                  Move through the complete programme without leaving the timetable.
                </p>
              </div>
            </div>

            <div className="-mx-5 border-y border-black/10 bg-[#f8f9fa] px-5 py-3 sm:-mx-8 sm:px-8 lg:sticky lg:top-20 lg:z-20 lg:mx-0 lg:px-0">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="event-filter-scroll flex items-center gap-6 overflow-x-auto" aria-label="Filter events by status">
                  {ARCHIVE_FILTERS.map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setArchiveFilter(filter)}
                      aria-pressed={archiveFilter === filter}
                      className={`relative min-h-11 shrink-0 px-0.5 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors ${archiveFilter === filter ? "text-[#111315]" : "text-black/42 hover:text-black"}`}
                    >
                      {filter}
                      <span
                        aria-hidden="true"
                        className={`absolute inset-x-0 bottom-0 h-0.5 origin-left bg-[#00629B] transition-transform duration-200 ${archiveFilter === filter ? "scale-x-100" : "scale-x-0"}`}
                      />
                    </button>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-[minmax(0,18rem)_minmax(0,15rem)] sm:items-end">
                  <label className="grid min-w-0 gap-1">
                    <span className="font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-black/35">Search</span>
                    <span className="relative block">
                      <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
                      <input
                        type="search"
                        value={archiveSearch}
                        onChange={(event) => setArchiveSearch(event.target.value)}
                        placeholder="Event or venue"
                        className="h-11 w-full border-b border-black/20 bg-transparent pl-7 pr-11 text-sm outline-none transition placeholder:text-black/30 focus:border-[#00629B]"
                      />
                      {archiveSearch && (
                        <button type="button" onClick={() => setArchiveSearch("")} aria-label="Clear search" className="absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-black/40 transition hover:text-black focus-visible:outline-2 focus-visible:outline-[#00629B]">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </span>
                  </label>

                  <label className="grid min-w-0 gap-1">
                    <span className="font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-black/35">Society</span>
                    <select
                      value={archiveSociety}
                      onChange={(event) => setArchiveSociety(event.target.value)}
                      aria-label="Filter by society"
                      className="h-11 max-w-full border-b border-black/20 bg-transparent pr-5 text-xs font-semibold text-black/60 outline-none focus:border-[#00629B]"
                    >
                      {societyOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-4 flex min-h-10 items-center justify-between border-b border-black/10 text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">
              <span>{filteredArchiveEvents.length} {filteredArchiveEvents.length === 1 ? "event" : "events"}</span>
              {(archiveSearch || archiveFilter !== "past" || archiveSociety !== "All societies") && (
                <button type="button" onClick={resetArchive} className="transition hover:text-[#00629B]">Reset</button>
              )}
            </div>

            <div className="mt-6 space-y-10 md:mt-8 md:space-y-12">
              {archiveGroups.length > 0 ? (
                archiveGroups.map((group, groupIndex) => (
                  <section key={group.label} className="grid gap-4 md:grid-cols-[190px_minmax(0,1fr)] md:gap-8">
                    <div>
                      <div className="md:sticky md:top-40">
                        <div className="font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-black/35">Index / month</div>
                        <h3 className="mt-2 text-2xl font-semibold leading-none tracking-[-0.05em] text-[#111315] sm:text-3xl">{group.label}</h3>
                        <div className="mt-3 text-[9px] font-bold uppercase tracking-[0.16em] text-[#00629B]">{String(group.events.length).padStart(2, "0")} listed</div>
                      </div>
                    </div>
                    <div className="border-b border-black/12">
                      {group.events.map((event, index) => (
                        <ArchiveRow key={event.id} event={event} index={groupIndex * ARCHIVE_PAGE_SIZE + index} />
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
                <button type="button" onClick={() => setVisibleArchiveCount((count) => count + ARCHIVE_PAGE_SIZE)} className="min-h-11 border-b-2 border-[#00629B] px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#111315] transition-colors hover:text-[#00629B] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#00629B]">
                  Load next 10 events ↓
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      <Footer />
    </main>
  );
}
