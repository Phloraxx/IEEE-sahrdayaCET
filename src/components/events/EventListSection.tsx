import { CalendarDays } from "lucide-react";
import type { ExtendedEvent } from "@/types";
import { EventRow } from "./AnnotatedEventCard";

interface EventListSectionProps {
  events: ExtendedEvent[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  title?: string;
  emptyTitle?: string;
  emptyMessage?: string;
  sectionId?: string;
  showHeader?: boolean;
}

/**
 * The events index opens with the programme itself. The compact header keeps
 * the page useful in the first viewport while the rows carry the editorial
 * character that makes the schedule feel like an IEEE Sahrdaya programme.
 */
export function EventListSection({
  events,
  loading,
  error,
  onRetry,
  title = "Events",
  emptyTitle = "Nothing scheduled yet",
  emptyMessage = "New events will appear here as soon as they are announced.",
  sectionId = "events-section",
  showHeader = true,
}: EventListSectionProps) {
  const year = new Intl.DateTimeFormat("en-IN", { year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date());
  const countLabel = events.length === 0
    ? "No upcoming events"
    : `${events.length} ${events.length === 1 ? "event" : "upcoming events"}`;

  return (
    <section className="mx-auto max-w-[1440px]" id={sectionId}>
      {showHeader && (
        <header className="grid gap-5 border-y border-black/10 py-5 md:grid-cols-12 md:items-end md:gap-8 md:py-6">
          <div className="md:col-span-3">
            <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#00629B]">
              <span className="font-pixel text-[8px] text-black/55">01</span>
              <span>Programme / {year}</span>
            </div>
            <div className="mt-3 flex items-baseline gap-3" aria-live="polite">
              <span className="font-mono text-3xl font-semibold leading-none tracking-[-0.08em] text-[#111315] tabular-nums sm:text-4xl">
                {String(events.length).padStart(2, "0")}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-black/55">
                upcoming
              </span>
            </div>
            <p className="mt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-black/55">Kodakara / Thrissur</p>
          </div>

          <div className="md:col-span-9 md:flex md:items-end md:justify-between md:gap-10">
            <div>
              <p className="font-pixel text-[8px] uppercase tracking-[0.14em] text-[#00629B]">IEEE / Sahrdaya</p>
              <h1 className="mt-2 max-w-4xl text-[clamp(2.65rem,4.8vw,4.75rem)] font-semibold leading-[0.9] tracking-[-0.07em] text-[#111315]">
                {title}
              </h1>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-black/60 md:mb-0.5 md:mt-0">
              Workshops, competitions and conversations—see what’s next and how to join.
            </p>
          </div>
        </header>
      )}

      {loading && <div className="h-48 animate-pulse border-b border-black/10 bg-black/[0.025]" />}

      {error && !loading && (
        <div className="flex items-center justify-between gap-4 border-b border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          <span>{error}</span>
          <button type="button" onClick={onRetry} className="font-bold underline underline-offset-4">Retry</button>
        </div>
      )}

      {!loading && !error && events.length > 0 && (
        <div className="mt-4 md:mt-5">
          <div className="flex min-h-11 items-center border-b border-black/10 px-3 font-mono text-[9px] font-bold uppercase tracking-[0.16em] sm:px-5 lg:px-6">
            <span className="flex items-center gap-2 text-[#00629B]">
              <span aria-hidden="true" className="event-signal-dot h-1.5 w-1.5 rounded-full bg-[#00629B]" />
              Next transmission
            </span>
          </div>
          <div className="hidden grid-cols-[92px_minmax(0,1fr)_112px_76px] gap-4 border-b border-black/10 px-4 py-3 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-black/55 sm:grid sm:px-5 lg:grid-cols-[92px_minmax(0,1fr)_148px_86px] lg:gap-6 lg:px-6">
            <span>Date</span>
            <span>Event / society</span>
            <span>When / where</span>
            <span className="text-right">Status</span>
          </div>
          <div className="border-b border-black/10">
            {events.map((event, index) => (
              <EventRow
                key={event.id}
                event={event}
                isNext={index === 0}
              />
            ))}
          </div>
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="grid min-h-48 place-items-center border-b border-black/10 py-12 text-center">
          <div>
            <CalendarDays className="mx-auto mb-4 h-7 w-7 text-black/30" />
            <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#111315]">{emptyTitle}</h2>
            <p className="mt-2 text-sm text-black/48">{emptyMessage}</p>
          </div>
        </div>
      )}

      <p className="sr-only" aria-live="polite">{countLabel}</p>
    </section>
  );
}
