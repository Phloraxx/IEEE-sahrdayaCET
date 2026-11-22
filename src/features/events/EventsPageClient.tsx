import { useEffect, useMemo } from "react";
import { Link, useRevalidator, useSearchParams } from "react-router";
import "@/styles/events.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { EventRow } from "@/components/events/AnnotatedEventCard";
import { FilterRail, type ProgrammeView } from "@/components/events/FilterRail";
import { PosterWall, type PosterGroup } from "@/components/events/PosterWall";
import { ProgrammeCover } from "@/components/events/ProgrammeCover";
import type { EventWithSociety, ExtendedEvent } from "@/types";
import { isPastEvent } from "@/lib/event-lifecycle";
import { formatMonthYear, formatYear } from "@/lib/dates";

const WALL_PAGE_SIZE = 24;
const LIST_PAGE_SIZE = 10;
const ALL_YEARS = "All years";
const ALL_SOCIETIES = "All societies";

interface EventsPageClientProps {
  initialEvents: EventWithSociety[];
}

export default function EventsPageClient({ initialEvents }: EventsPageClientProps) {
  const revalidator = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get("q") || "";
  const society = searchParams.get("society") || ALL_SOCIETIES;
  const year = searchParams.get("year") || ALL_YEARS;
  const view: ProgrammeView = searchParams.get("view") === "list" ? "list" : "wall";
  const pageSize = view === "wall" ? WALL_PAGE_SIZE : LIST_PAGE_SIZE;

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

  const extendedEvents: ExtendedEvent[] = useMemo(
    () => initialEvents.map((event) => ({ ...event, about: event.description || "Join us for this IEEE Sahrdaya event." })),
    [initialEvents],
  );

  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    return extendedEvents
      .filter((event) => !isPastEvent(event, now))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [extendedEvents]);

  const pastEvents = useMemo(() => {
    const now = Date.now();
    return extendedEvents
      .filter((event) => isPastEvent(event, now))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [extendedEvents]);

  const societyOptions = useMemo(
    () => [
      ALL_SOCIETIES,
      ...Array.from(
        new Set(
          pastEvents
            .map((event) => (typeof event.society === "object" ? event.society.name?.trim() : ""))
            .filter((name): name is string => Boolean(name)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    ],
    [pastEvents],
  );

  const yearOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of pastEvents) {
      const key = formatYear(event.date);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [
      { value: ALL_YEARS, count: pastEvents.length },
      ...Array.from(counts.entries())
        .sort((a, b) => Number(b[0]) - Number(a[0]))
        .map(([value, count]) => ({ value, count })),
    ];
  }, [pastEvents]);

  const filteredEvents = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return pastEvents.filter((event) => {
      const societyName = typeof event.society === "object" ? event.society.name : "";
      const matchesYear = year === ALL_YEARS || formatYear(event.date) === year;
      const matchesSociety = society === ALL_SOCIETIES || societyName === society;
      const matchesSearch =
        !needle ||
        [event.title, event.description, event.venue, societyName]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      return matchesYear && matchesSociety && matchesSearch;
    });
  }, [pastEvents, search, society, year]);

  const isAllYears = year === ALL_YEARS;

  /* Every year keeps a chapter on the page: with "All years" active we cap each
     year instead of the total, so 2025–2023 are reachable without paging. */
  const yearBuckets = useMemo(() => {
    const buckets = new Map<string, ExtendedEvent[]>();
    for (const event of filteredEvents) {
      const key = formatYear(event.date);
      const list = buckets.get(key);
      if (list) list.push(event);
      else buckets.set(key, [event]);
    }
    return Array.from(buckets.entries()).sort((a, b) => Number(b[0]) - Number(a[0]));
  }, [filteredEvents]);

  const requestedLimit = Number(searchParams.get("limit")) || 0;
  const perYearCap = Math.max(8, requestedLimit || 8);
  const totalCap = Math.max(pageSize, requestedLimit || pageSize);

  const visibleEvents = isAllYears
    ? yearBuckets.flatMap(([, list]) => list.slice(0, perYearCap))
    : filteredEvents.slice(0, totalCap);

  const hasMore = isAllYears
    ? yearBuckets.some(([, list]) => list.length > perYearCap)
    : visibleEvents.length < filteredEvents.length;

  const nextLimit = isAllYears ? perYearCap + 8 : totalCap + pageSize;

  const wallGroups = useMemo<PosterGroup[]>(() => {
    const groups: PosterGroup[] = [];
    for (const event of visibleEvents) {
      const key = formatYear(event.date);
      const last = groups[groups.length - 1];
      if (last && last.year === key) last.events.push(event);
      else groups.push({ year: key, events: [event] });
    }
    return groups;
  }, [visibleEvents]);

  const listGroups = useMemo(() => {
    const groups: Array<{ label: string; events: ExtendedEvent[] }> = [];
    for (const event of visibleEvents) {
      const label = formatMonthYear(event.date);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.events.push(event);
      else groups.push({ label, events: [event] });
    }
    return groups;
  }, [visibleEvents]);

  const setParam = (key: string, value: string) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value && value !== ALL_YEARS && value !== ALL_SOCIETIES) next.set(key, value);
        else next.delete(key);
        if (key !== "limit") next.delete("limit");
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  };

  const resetFilters = () => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete("q");
        next.delete("society");
        next.delete("year");
        next.delete("limit");
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  };

  const coverEvent = upcomingEvents[0] ?? pastEvents[0];
  const hasFilters = Boolean(search) || society !== ALL_SOCIETIES || year !== ALL_YEARS;
  const currentYear = formatYear(new Date().toISOString());

  return (
    <main className="events-page min-h-screen overflow-x-clip bg-[#f8f9fa] text-[#111315] selection:bg-[#00629B] selection:text-white">
      <Navbar />

      {coverEvent ? (
        <ProgrammeCover
          event={coverEvent}
          isUpcoming={upcomingEvents.length > 0}
          year={currentYear}
        />
      ) : null}

      <section id="event-archive" className="scroll-mt-24 px-5 pb-24 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[1440px]">
          <div id="programme-wall" className="scroll-mt-28 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
            <div>
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#00629B]">
                <span className="font-pixel text-[8px] text-black/55">02</span> / Archive
              </p>
              <h2 className="mt-2 text-4xl font-semibold leading-none tracking-[-0.055em] text-[#111315] sm:text-5xl">
                The wall
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-black/55 sm:text-right">
              Every poster the branch has made — and a note where there was no poster to hang.
            </p>
          </div>

          <FilterRail
            years={yearOptions}
            activeYear={year}
            onYear={(value) => setParam("year", value)}
            societies={societyOptions}
            activeSociety={society}
            onSociety={(value) => setParam("society", value)}
            search={search}
            onSearch={(value) => setParam("q", value)}
            view={view}
            onView={(value) => setParam("view", value === "wall" ? "" : value)}
            resultCount={filteredEvents.length}
            hasFilters={hasFilters}
            onReset={resetFilters}
          />

          <div className="mt-10">
            {view === "wall" ? (
              <PosterWall
                groups={wallGroups}
                emptyTitle={pastEvents.length === 0 ? "The wall is still blank" : "No posters match that"}
                emptyMessage={
                  pastEvents.length === 0
                    ? "Completed programmes will hang here once the first season closes."
                    : "Try another year, a different society, or a shorter search."
                }
                onReset={pastEvents.length > 0 ? resetFilters : undefined}
              />
            ) : listGroups.length > 0 ? (
              <div className="space-y-10 md:space-y-12">
                {listGroups.map((group) => (
                  <section key={group.label} className="grid gap-4 md:grid-cols-[190px_minmax(0,1fr)] md:gap-8">
                    <div className="lg:sticky lg:top-48 lg:self-start">
                      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-black/55">Archive / month</div>
                      <h3 className="mt-2 text-2xl font-semibold leading-none tracking-[-0.05em] text-[#111315] sm:text-3xl">{group.label}</h3>
                      <div className="mt-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#00629B]">
                        {String(group.events.length).padStart(2, "0")} listed
                      </div>
                    </div>
                    <div className="border-b border-black/12">
                      {group.events.map((event) => (
                        <EventRow key={event.id} event={event} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="grid min-h-56 place-items-center border-y border-black/10 px-4 py-8 text-center">
                <div>
                  <h3 className="text-xl font-semibold">{pastEvents.length === 0 ? "The event archive is growing" : "No past events match your filters"}</h3>
                  <p className="mt-2 text-sm text-black/60">
                    {pastEvents.length === 0 ? "Completed programmes will appear here." : "Try another keyword or choose a different society."}
                  </p>
                  {pastEvents.length > 0 ? (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="mt-3 inline-flex min-h-11 items-center px-3 text-xs font-bold uppercase tracking-[0.14em] text-[#00629B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00629B]"
                    >
                      Reset filters
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          {hasMore ? (
            <div className="mt-12 flex justify-center">
              <button
                type="button"
                onClick={() => setParam("limit", String(nextLimit))}
                className="inline-flex min-h-11 items-center rounded-full bg-white px-6 text-[10px] font-bold uppercase tracking-[0.14em] text-[#111315] shadow-[0_2px_12px_rgba(6,17,29,0.08)] ring-1 ring-black/[0.06] transition-colors hover:text-[#00629B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00629B]"
              >
                {isAllYears ? "Show more from every year" : `Show more ${view === "wall" ? "posters" : "events"}`}
              </button>
            </div>
          ) : null}

          <section className="relative mt-16 overflow-hidden rounded-[32px] sm:mt-24">
            <img
              src="/AGM.webp"
              alt="Aerial view of the Sahrdaya College of Engineering campus"
              loading="lazy"
              className="h-[360px] w-full object-cover sm:h-[420px]"
            />
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#07131c]/95 via-[#07131c]/72 to-[#07131c]/38" />
            <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-white">
              <p className="font-[Caveat] text-2xl text-white/55">the wall keeps growing</p>
              <h2 className="mx-auto mt-2 max-w-2xl text-3xl font-semibold leading-[1.05] tracking-[-0.045em] sm:text-4xl">
                Every season hangs another row of posters.
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/60">
                Want yours on this wall? Join a society, or come to the next workshop.
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <Link
                  to="/societies"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-xs font-bold uppercase tracking-[0.14em] text-[#0b1a26] transition-colors hover:bg-[#00629B] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Meet the societies
                </Link>
                <Link
                  to="/contact"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 px-5 text-xs font-bold uppercase tracking-[0.14em] text-white/80 transition-colors hover:border-white hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Talk to the branch
                </Link>
              </div>
            </div>
          </section>
        </div>
      </section>

      <Footer />
    </main>
  );
}
