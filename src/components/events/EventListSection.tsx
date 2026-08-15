import { CalendarDays } from "lucide-react";
import type { ExtendedEvent } from "@/types";
import { AnnotatedEventCard as EventCard } from "./AnnotatedEventCard";

interface EventListSectionProps {
  events: ExtendedEvent[];
  loading: boolean;
  error: string | null;
  onSelectEvent: (event: ExtendedEvent) => void;
  onRetry: () => void;
  title?: string;
  emptyTitle?: string;
  emptyMessage?: string;
  showAnnotation?: boolean;
  sectionId?: string;
  showHeader?: boolean;
  animateCards?: boolean;
}

export function EventListSection({
  events,
  loading,
  error,
  onSelectEvent,
  onRetry,
  title = "Upcoming",
  emptyTitle = "Nothing scheduled yet",
  emptyMessage = "New events will appear here as soon as they are announced.",
  sectionId = "events-section",
  showHeader = true,
  animateCards = true,
}: EventListSectionProps) {
  return (
    <section className="mx-auto max-w-[1440px]" id={sectionId}>
      {showHeader && (
        <div className="mb-10 flex items-end justify-between border-t border-black/10 pt-5 md:mb-14">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#00629B]">Discover</p>
            <h2 className="text-4xl font-semibold tracking-[-0.05em] text-[#111315] sm:text-5xl">{title}</h2>
          </div>
          <span className="text-xs font-semibold tabular-nums text-black/40">{String(events.length).padStart(2, "0")}</span>
        </div>
      )}

      {loading && <div className="h-48 animate-pulse bg-black/[0.035]" />}

      {error && !loading && (
        <div className="flex items-center justify-between gap-4 border-y border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          <span>{error}</span>
          <button onClick={onRetry} className="font-bold underline underline-offset-4">Retry</button>
        </div>
      )}

      {!loading && events.length > 0 && (
        <div className="grid grid-cols-1 gap-x-7 gap-y-12 md:grid-cols-2 lg:gap-x-10 lg:gap-y-16">
          {events.map((event, index) => (
            <div key={event.id} className={index % 5 === 2 ? "md:translate-y-12" : ""}>
              <EventCard event={event} index={index} onSelect={onSelectEvent} animateEntrance={animateCards} />
            </div>
          ))}
        </div>
      )}

      {!loading && events.length === 0 && (
        <div className="grid min-h-64 place-items-center border-y border-black/10 py-16 text-center">
          <div>
            <CalendarDays className="mx-auto mb-5 h-7 w-7 text-black/30" />
            <h3 className="text-2xl font-semibold tracking-tight text-[#111315]">{emptyTitle}</h3>
            <p className="mt-2 text-sm text-black/50">{emptyMessage}</p>
          </div>
        </div>
      )}
    </section>
  );
}
