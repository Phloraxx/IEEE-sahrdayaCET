import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CalendarDays } from "lucide-react";
import type { ExtendedEvent } from "@/types";
import { MOTION_DURATION, MOTION_EASE } from "@/lib/motion";
import { resolveEventArtwork } from "@/lib/event-artwork";
import { getEventAvailability, type EventAvailabilityKind } from "@/lib/event-availability";
import { formatYear } from "@/lib/dates";
import { EventArtworkPreview } from "./EventArtworkPreview";
import { EventBannerFallback } from "./EventBannerFallback";
import { AnnotatedEventCard as EventRow } from "./AnnotatedEventCard";

interface EventListSectionProps {
  events: ExtendedEvent[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  title?: string;
  emptyTitle?: string;
  emptyMessage?: string;
  showAnnotation?: boolean;
  sectionId?: string;
  showHeader?: boolean;
  animateCards?: boolean;
}

const previewAvailabilityClass: Record<EventAvailabilityKind, string> = {
  "opening-soon": "text-[#00629B]",
  open: "text-[#00629B]",
  filling: "text-teal-700",
  "filling-fast": "text-amber-700",
  "few-left": "text-orange-700",
  "closing-soon": "text-amber-700",
  full: "text-rose-700",
  closed: "text-black/38",
};
export function EventListSection({
  events,
  loading,
  error,
  onRetry,
  title = "Upcoming programme",
  emptyTitle = "Nothing scheduled yet",
  emptyMessage = "New events will appear here as soon as they are announced.",
  sectionId = "events-section",
  showHeader = true,
  animateCards = true,
}: EventListSectionProps) {
  const reduceMotion = useReducedMotion();
  const [activeEventId, setActiveEventId] = useState<string | null>(events[0]?.id ?? null);

  useEffect(() => {
    if (!events.length) {
      setActiveEventId(null);
      return;
    }
    if (!events.some((event) => event.id === activeEventId)) setActiveEventId(events[0]?.id ?? null);
  }, [activeEventId, events]);

  const activeEvent = useMemo(
    () => events.find((event) => event.id === activeEventId) ?? events[0] ?? null,
    [activeEventId, events],
  );
  const activeArtwork = activeEvent ? resolveEventArtwork(activeEvent) : null;
  const activeSociety = activeEvent && typeof activeEvent.society === "object" ? activeEvent.society : null;
  const activeAvailability = activeEvent ? getEventAvailability(activeEvent) : null;

  return (
    <section className="mx-auto max-w-[1440px]" id={sectionId}>
      {showHeader && (
        <div className="grid gap-6 border-t border-black/12 pb-10 pt-6 md:grid-cols-12 md:items-end md:pb-14">
          <div className="md:col-span-7">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[#00629B]">Live programme</p>
            <h2 className="text-5xl font-semibold leading-[0.94] tracking-[-0.06em] text-[#111315] sm:text-6xl lg:text-7xl">{title}</h2>
          </div>
          <div className="flex items-end justify-between gap-6 md:col-span-5">
            <p className="max-w-sm text-sm leading-relaxed text-black/50 sm:text-base">
              Scan the dates, preview the programme, then open the event that earns your time.
            </p>
            <span className="shrink-0 text-4xl font-semibold tracking-[-0.06em] text-black/18 tabular-nums sm:text-5xl">
              {String(events.length).padStart(2, "0")}
            </span>
          </div>
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
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.18fr)_minmax(340px,0.72fr)] lg:gap-12 xl:gap-16">
          <div className="border-b border-black/12">
            {events.map((event, index) => (
              <EventRow
                key={event.id}
                event={event}
                index={index}
                active={event.id === activeEvent?.id}
                onActivate={(item) => setActiveEventId(item.id)}
                animateEntrance={animateCards}
              />
            ))}
          </div>
          <aside className="relative hidden lg:block">
            <div className="sticky top-28">
              <div className="mb-4 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.2em] text-black/38">
                <span>Programme preview</span>
                <span>{activeEvent ? formatYear(activeEvent.date) : ""}</span>
              </div>

              <div className="relative aspect-[4/5] overflow-hidden bg-[#111315]">
                <AnimatePresence mode="wait" initial={false}>
                  {activeEvent && (
                    <motion.div
                      key={activeEvent.id}
                      initial={reduceMotion ? false : { opacity: 0, scale: 1.015 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={reduceMotion ? undefined : { opacity: 0 }}
                      transition={{ duration: MOTION_DURATION.reveal, ease: MOTION_EASE }}
                      className="absolute inset-0"
                    >
                      {activeArtwork ? (
                        <EventArtworkPreview
                          src={activeArtwork.src}
                          alt={`${activeEvent.title} event artwork`}
                        />
                      ) : (
                        <EventBannerFallback
                          title={activeEvent.title}
                          societyName={activeSociety?.name}
                          societySlug={activeSociety?.slug}
                          showTitle={false}
                        />
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {activeEvent && (
                <div className="mt-5 border-b border-black/12 pb-5">
                  <div className="flex items-center justify-between gap-4 text-[9px] font-bold uppercase tracking-[0.18em]">
                    <span className="truncate text-black/38">{activeSociety?.name || "IEEE Sahrdaya"}</span>
                    <span className="shrink-0 text-[#00629B]">{activeEvent.price > 0 ? `₹${activeEvent.price}` : "Free"}</span>
                  </div>
                  <div className="mt-3 text-2xl font-semibold leading-[1.02] tracking-[-0.045em] text-[#111315]">{activeEvent.title}</div>
                  <div className={`mt-3 text-[9px] font-bold uppercase tracking-[0.16em] ${activeAvailability ? previewAvailabilityClass[activeAvailability.kind] : "text-black/38"}`}>{activeAvailability?.label || "View event"}</div>
                </div>
              )}
            </div>
          </aside>
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
