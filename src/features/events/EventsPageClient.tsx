import { useEffect, useMemo, useState } from "react";
import { useRevalidator } from "react-router";
import { Search } from "lucide-react";
import "@/styles/events.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  EventHeroSection,
  EventListSection,
} from "@/components/events";
import type { EventWithSociety, ExtendedEvent } from "@/types";
import { isPastEvent } from "@/lib/event-lifecycle";

const ARCHIVE_PAGE_SIZE = 8;
const ARCHIVE_FILTERS = ["all", "upcoming", "past"] as const;
type ArchiveFilter = (typeof ARCHIVE_FILTERS)[number];

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
  const revalidator = useRevalidator();
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("past");
  const [archiveSociety, setArchiveSociety] = useState("All societies");
  const [visibleArchiveCount, setVisibleArchiveCount] = useState(ARCHIVE_PAGE_SIZE);

  // Event status and registration windows are time-dependent. Revalidate while
  // this page is open so an event automatically moves to Past Events and a
  // registration action closes/opens without requiring a manual page refresh.
  useEffect(() => {
    const refreshLifecycle = () => {
      if (document.visibilityState === "visible") {
        void revalidator.revalidate();
      }
    };

    const intervalId = window.setInterval(refreshLifecycle, 60_000);
    document.addEventListener("visibilitychange", refreshLifecycle);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshLifecycle);
    };
  }, [revalidator]);

  useEffect(() => {
    setVisibleArchiveCount(ARCHIVE_PAGE_SIZE);
  }, [archiveFilter, archiveSearch, archiveSociety]);

  const extendedEvents: ExtendedEvent[] = useMemo(() => {
    return initialEvents.map((event, index) => ({
      ...event,
      about: event.description || "Join us for this exciting IEEE event!",
      tags: event.society?.name || "IEEE Event",
      ...getEventColor(index),
    }));
  }, [initialEvents]);

  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    return extendedEvents
      .filter((event) => !isPastEvent(event, now))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [extendedEvents]);

  const societyOptions = useMemo(
    () => [
      "All societies",
      ...Array.from(
        new Set(
          extendedEvents
            .map((event) => event.society?.name?.trim())
            .filter((name): name is string => Boolean(name)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    ],
    [extendedEvents],
  );

  const filteredArchiveEvents = useMemo(() => {
    const now = Date.now();
    const needle = archiveSearch.trim().toLowerCase();

    return extendedEvents
      .filter((event) => {
        const past = isPastEvent(event, now);
        const matchesLifecycle =
          archiveFilter === "all" ||
          (archiveFilter === "past" ? past : !past);
        const matchesSociety =
          archiveSociety === "All societies" || event.society?.name === archiveSociety;
        const matchesSearch =
          !needle ||
          [event.title, event.description, event.venue, event.society?.name]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(needle));

        return matchesLifecycle && matchesSociety && matchesSearch;
      })
      .sort((a, b) => {
        const aTime = new Date(a.date).getTime();
        const bTime = new Date(b.date).getTime();
        if (archiveFilter === "upcoming") return aTime - bTime;
        return bTime - aTime;
      });
  }, [archiveFilter, archiveSearch, archiveSociety, extendedEvents]);

  const visibleArchiveEvents = filteredArchiveEvents.slice(0, visibleArchiveCount);
  const hasMoreArchiveEvents = visibleArchiveCount < filteredArchiveEvents.length;

  return (
    <main className="min-h-screen text-slate-800 font-sans selection:bg-ieee-blue selection:text-white overflow-x-hidden relative bg-[#F8F9FA]">
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.02] z-50 mix-blend-overlay"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")',
        }}
      />

      <Navbar />
      <EventHeroSection />

      <section className="px-4 max-w-[1400px] mx-auto">
        <EventListSection
          events={upcomingEvents}
          loading={false}
          error={null}
          onRetry={() => revalidator.revalidate()}
          title="Upcoming Events"
          emptyTitle="No Upcoming Events"
          emptyMessage="Check back soon for exciting new events!"
          sectionId="events-section"
        />

        <section id="event-archive" className="mx-auto mt-24 max-w-[1100px] pb-24 px-4">
          <div className="border-t border-slate-200 pt-12">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.26em] text-ieee-blue">
                  Browse the archive
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <h2 className="text-4xl font-black tracking-tight text-slate-800">All Events</h2>
                  <span className="rounded-full bg-[#EA4335]/10 px-3 py-1 text-xs font-bold text-[#EA4335]">
                    {filteredArchiveEvents.length}
                  </span>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
                  Search the full IEEE Sahrdaya event archive without loading every past event at once.
                </p>
              </div>

              <div className="relative w-full max-w-md">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={archiveSearch}
                  onChange={(event) => setArchiveSearch(event.target.value)}
                  placeholder="Search events, venue or society"
                  aria-label="Search event archive"
                  className="h-12 w-full rounded-full border border-slate-200 bg-white pl-11 pr-4 text-sm outline-none transition focus:border-ieee-blue/50 focus:ring-4 focus:ring-ieee-blue/10"
                />
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-4 border-y border-slate-200 py-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2" aria-label="Filter event archive by status">
                {ARCHIVE_FILTERS.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setArchiveFilter(filter)}
                    aria-pressed={archiveFilter === filter}
                    className={`rounded-full px-4 py-2 text-xs font-bold capitalize transition ${
                      archiveFilter === filter
                        ? "bg-slate-900 text-white"
                        : "border border-slate-200 bg-white text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              <select
                value={archiveSociety}
                onChange={(event) => setArchiveSociety(event.target.value)}
                aria-label="Filter event archive by society"
                className="h-10 rounded-full border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 outline-none focus:border-ieee-blue/50"
              >
                {societyOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
              <span>
                Showing {Math.min(visibleArchiveEvents.length, filteredArchiveEvents.length)} of {filteredArchiveEvents.length} events
              </span>
              {(archiveSearch || archiveFilter !== "past" || archiveSociety !== "All societies") && (
                <button
                  type="button"
                  onClick={() => {
                    setArchiveSearch("");
                    setArchiveFilter("past");
                    setArchiveSociety("All societies");
                  }}
                  className="font-bold text-ieee-blue hover:underline"
                >
                  Reset filters
                </button>
              )}
            </div>

            <EventListSection
              events={visibleArchiveEvents}
              loading={false}
              error={null}
                  onRetry={() => revalidator.revalidate()}
              emptyTitle="No Events Found"
              emptyMessage="Try another search, status, or society filter."
              showAnnotation={false}
              showHeader={false}
              animateCards={false}
              sectionId="event-archive-results"
            />

            {hasMoreArchiveEvents && (
              <div className="mt-10 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleArchiveCount((count) => count + ARCHIVE_PAGE_SIZE)}
                  className="rounded-full bg-slate-900 px-6 py-3 text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:-translate-y-0.5 hover:bg-ieee-blue"
                >
                  Load more events
                </button>
              </div>
            )}
          </div>
        </section>
      </section>

      <Footer />

    </main>
  );
}
