import { useEffect, useMemo, useState } from "react";
import { Link, useRevalidator } from "react-router";
import { ArrowUpRight, Search, Ticket, X } from "lucide-react";
import "@/styles/events.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { EventListSection } from "@/components/events";
import type { EventWithSociety, ExtendedEvent } from "@/types";
import { isPastEvent } from "@/lib/event-lifecycle";
import { formatDay, formatMonthYear, formatWeekdayShort } from "@/lib/dates";

const ARCHIVE_PAGE_SIZE = 10;

interface EventsPageClientProps {
  initialEvents: EventWithSociety[];
}

function ArchiveRow({ event }: { event: ExtendedEvent }) {
  const societyName = typeof event.society === "object" ? event.society.name : "IEEE Sahrdaya";

  return (
    <div className="border-t border-black/12">
      <Link
        to={`/events/${event.slug}`}
        className="group grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-4 px-3 py-5 transition-colors hover:bg-[#00629B]/[0.035] focus-visible:bg-[#00629B]/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00629B] sm:grid-cols-[88px_minmax(0,1fr)_190px_90px] sm:gap-6 md:px-4 md:py-6"
      >
        <div>
          <div className="text-2xl font-semibold tracking-[-0.05em] tabular-nums text-[#111315]">{formatDay(event.date)}</div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-black/55">{formatWeekdayShort(event.date)}</div>
        </div>
        <div className="min-w-0">
          <div className="line-clamp-3 text-lg font-semibold leading-tight tracking-[-0.025em] text-[#111315] transition-colors group-hover:text-[#00629B] group-focus-visible:text-[#00629B] sm:line-clamp-2 sm:text-xl">{event.title}</div>
          <div className="mt-1 truncate text-xs text-black/55 sm:hidden">{societyName}</div>
        </div>
        <div className="hidden truncate text-xs font-medium text-black/55 sm:block">{societyName}</div>
        <div className="flex items-center justify-end gap-3">
          <span className="hidden text-[10px] font-bold uppercase tracking-[0.12em] text-black/55 md:inline">{event.price > 0 ? `₹${event.price} entry` : "Free entry"}</span>
          <span className="grid h-10 w-10 place-items-center border border-black/14 transition group-hover:border-[#00629B] group-hover:bg-[#00629B] group-hover:text-white group-focus-visible:border-[#00629B] group-focus-visible:bg-[#00629B] group-focus-visible:text-white">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
      </Link>
    </div>
  );
}

export default function EventsPageClient({ initialEvents }: EventsPageClientProps) {
  const revalidator = useRevalidator();
  const [archiveSearch, setArchiveSearch] = useState("");
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

  useEffect(() => setVisibleArchiveCount(ARCHIVE_PAGE_SIZE), [archiveSearch, archiveSociety]);

  const extendedEvents: ExtendedEvent[] = useMemo(
    () => initialEvents.map((event) => ({ ...event, about: event.description || "Join us for this IEEE Sahrdaya event." })),
    [initialEvents],
  );

  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    return extendedEvents.filter((event) => !isPastEvent(event, now)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [extendedEvents]);

  const pastEvents = useMemo(() => {
    const now = Date.now();
    return extendedEvents
      .filter((event) => isPastEvent(event, now))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [extendedEvents]);

  const societyOptions = useMemo(
    () => ["All societies", ...Array.from(new Set(pastEvents.map((event) => typeof event.society === "object" ? event.society.name?.trim() : "").filter((name): name is string => Boolean(name)))).sort((a, b) => a.localeCompare(b))],
    [pastEvents],
  );

  const filteredArchiveEvents = useMemo(() => {
    const needle = archiveSearch.trim().toLowerCase();
    return pastEvents.filter((event) => {
      const societyName = typeof event.society === "object" ? event.society.name : "";
      const matchesSociety = archiveSociety === "All societies" || societyName === archiveSociety;
      const matchesSearch = !needle || [event.title, event.description, event.venue, societyName].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle));
      return matchesSociety && matchesSearch;
    });
  }, [archiveSearch, archiveSociety, pastEvents]);

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
    setArchiveSociety("All societies");
  };

  return (
    <main className="events-page min-h-screen overflow-x-hidden bg-[#f8f9fa] text-[#111315] selection:bg-[#00629B] selection:text-white">
      <Navbar />
      <div className="px-5 pt-10 sm:px-8 sm:pt-12 md:pt-24 lg:px-12">
        <div className="mx-auto max-w-[1440px] pb-10 pt-2 md:pb-14 md:pt-6" id="upcoming-events">
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
                  <span className="font-pixel text-[8px] text-black/55">02</span> / Archive
                </p>
                <p className="mt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-black/55">
                  {String(pastEvents.length).padStart(2, "0")} past events
                </p>
              </div>
              <div className="md:col-span-9 md:flex md:items-end md:justify-between md:gap-8">
                <h2 className="text-2xl font-semibold leading-none tracking-[-0.05em] text-[#111315] sm:text-3xl">Past programme</h2>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-black/60 md:mt-0 md:text-right">
                  Revisit workshops, competitions and talks from previous seasons.
                </p>
              </div>
            </div>

            <div className="-mx-5 border-y border-black/10 bg-[#f8f9fa] px-5 py-3 sm:-mx-8 sm:px-8 lg:sticky lg:top-20 lg:z-20 lg:mx-0 lg:px-0">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,18rem)_minmax(0,15rem)] sm:items-end lg:ml-auto lg:w-fit">
                <label className="grid min-w-0 gap-1">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-black/55">Search past events</span>
                  <span className="relative block">
                    <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-black/50" />
                    <input
                      type="search"
                      value={archiveSearch}
                      onChange={(event) => setArchiveSearch(event.target.value)}
                      placeholder="Title, society or venue"
                      className="h-11 w-full border-b border-black/25 bg-transparent pl-7 pr-11 text-sm outline-none transition-colors placeholder:text-black/45 focus:border-[#00629B] focus-visible:ring-2 focus-visible:ring-[#00629B] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f8f9fa]"
                    />
                    {archiveSearch && (
                      <button type="button" onClick={() => setArchiveSearch("")} aria-label="Clear search" className="absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-black/55 transition-colors hover:text-black focus-visible:outline-2 focus-visible:outline-[#00629B]">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </span>
                </label>

                <label className="grid min-w-0 gap-1">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-black/55">Society</span>
                  <select
                    value={archiveSociety}
                    onChange={(event) => setArchiveSociety(event.target.value)}
                    aria-label="Filter past events by society"
                    className="h-11 max-w-full border-b border-black/25 bg-transparent pr-5 text-sm font-semibold text-black/65 outline-none transition-colors focus:border-[#00629B] focus-visible:ring-2 focus-visible:ring-[#00629B] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f8f9fa]"
                  >
                    {societyOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
              </div>
            </div>

            <div className="mt-4 flex min-h-11 items-center justify-between border-b border-black/10 text-[10px] font-semibold uppercase tracking-[0.14em] text-black/55">
              <span>Showing {Math.min(visibleArchiveCount, filteredArchiveEvents.length)} of {filteredArchiveEvents.length} {filteredArchiveEvents.length === 1 ? "past event" : "past events"}</span>
              {(archiveSearch || archiveSociety !== "All societies") && (
                <button type="button" onClick={resetArchive} className="inline-flex min-h-11 items-center px-3 transition-colors hover:text-[#00629B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00629B]">Reset filters</button>
              )}
            </div>

            <div className="mt-6 space-y-10 md:mt-8 md:space-y-12">
              {archiveGroups.length > 0 ? (
                archiveGroups.map((group) => (
                  <section key={group.label} className="grid gap-4 md:grid-cols-[190px_minmax(0,1fr)] md:gap-8">
                    <div>
                      <div className="md:sticky md:top-40">
                        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-black/55">Archive / month</div>
                        <h3 className="mt-2 text-2xl font-semibold leading-none tracking-[-0.05em] text-[#111315] sm:text-3xl">{group.label}</h3>
                        <div className="mt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#00629B]">{String(group.events.length).padStart(2, "0")} listed</div>
                      </div>
                    </div>
                    <div className="border-b border-black/12">
                      {group.events.map((event) => (
                        <ArchiveRow key={event.id} event={event} />
                      ))}
                    </div>
                  </section>
                ))
              ) : (
                <div className="grid min-h-56 place-items-center border-y border-black/10 text-center">
                  <div>
                    <Ticket className="mx-auto mb-4 h-6 w-6 text-black/30" />
                    <h3 className="text-xl font-semibold">{archiveSearch ? `No past events match “${archiveSearch}”` : "No past events match these filters"}</h3>
                    <button type="button" onClick={resetArchive} className="mt-3 inline-flex min-h-11 items-center px-3 text-xs font-bold uppercase tracking-[0.14em] text-[#00629B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00629B]">Reset filters</button>
                  </div>
                </div>
              )}
            </div>

            {hasMoreArchiveEvents && (
              <div className="mt-10 flex justify-center">
                <button type="button" onClick={() => setVisibleArchiveCount((count) => count + ARCHIVE_PAGE_SIZE)} className="min-h-11 border-b-2 border-[#00629B] px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#111315] transition-colors hover:text-[#00629B] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#00629B]">
                  Show 10 more events
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
