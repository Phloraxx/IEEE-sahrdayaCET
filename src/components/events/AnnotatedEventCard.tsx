import { ArrowUpRight, MapPin } from "lucide-react";
import { Link } from "react-router";
import type { ExtendedEvent } from "@/types";
import { formatDay, formatEventTime, formatMonth, formatWeekdayShort, formatYear } from "@/lib/dates";
import { getEventAvailability, type EventAvailabilityKind } from "@/lib/event-availability";
import { resolveEventArtwork } from "@/lib/event-artwork";
import { EventArtworkPreview } from "./EventArtworkPreview";
import { EventBannerFallback } from "./EventBannerFallback";

interface EventRowProps {
  event: ExtendedEvent;
  isNext?: boolean;
}

const availabilityClass: Record<EventAvailabilityKind, string> = {
  "opening-soon": "text-[#00629B]",
  open: "text-[#00629B]",
  filling: "text-teal-700",
  "filling-fast": "text-amber-700",
  "few-left": "text-orange-700",
  "closing-soon": "text-amber-700",
  full: "text-rose-700",
  closed: "text-black/60",
};

function scheduleTime(event: ExtendedEvent): string {
  if (event.timeTbc) return "Time TBA";
  return formatEventTime(event.date, false) || "Time TBA";
}

export function EventRow({ event, isNext = false }: EventRowProps) {
  const societyName = typeof event.society === "object" ? event.society.name : "IEEE Sahrdaya";
  const societySlug = typeof event.society === "object" ? event.society.slug : undefined;
  const availability = getEventAvailability(event);
  const artwork = resolveEventArtwork(event);
  const time = scheduleTime(event);
  const statusLabel = event.status === "cancelled"
    ? "Cancelled"
    : availability.kind === "closed"
      ? "Registration closed"
      : availability.kind === "open"
        ? "Registration open"
        : availability.label;

  return (
    <article className="relative border-t border-black/10" data-next={isNext ? "true" : "false"}>
      {isNext && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-[#00629B]" />}
      <Link
        to={`/events/${event.slug}`}
        className="group block min-h-[92px] text-[#111315] transition-colors duration-200 hover:bg-[#00629B]/[0.035] focus-visible:bg-[#00629B]/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00629B]"
      >
        <div className="grid grid-cols-[64px_minmax(0,1fr)_74px] items-center gap-3 px-3 py-4 sm:grid-cols-[92px_minmax(0,1fr)_112px_104px] sm:gap-4 sm:px-5 sm:py-5 lg:grid-cols-[92px_minmax(0,1fr)_148px_118px] lg:gap-6 lg:px-6">
          <div className="min-w-0">
            <div className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-[#00629B]">{formatMonth(event.date)}</div>
            <div className="mt-1 font-mono text-3xl font-semibold leading-none tracking-[-0.08em] tabular-nums sm:text-4xl">{formatDay(event.date)}</div>
            <div className="mt-1 whitespace-nowrap font-mono text-xs font-medium uppercase tracking-[0.04em] text-black/60">{formatWeekdayShort(event.date)} · {formatYear(event.date)}</div>
          </div>

          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs font-semibold uppercase tracking-[0.06em] text-black/60">
                <span className="break-words">{societyName}</span>
                <span aria-hidden="true" className="text-black/25">/</span>
                <span>{event.price > 0 ? `₹${event.price} entry` : "Free entry"}</span>
              </div>
              <h3 className="max-w-3xl break-words text-[1.18rem] font-semibold leading-[1.04] tracking-[-0.045em] transition-colors duration-200 group-hover:text-[#00629B] group-focus-visible:text-[#00629B] sm:text-2xl lg:text-[2rem]">{event.title}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-tight text-black/65 sm:hidden">
                <span>{time}</span>
                <span aria-hidden="true">·</span>
                <span className="break-words">{event.venue || "Venue TBA"}</span>
              </div>
            </div>
            <div className="relative hidden h-12 w-16 shrink-0 overflow-hidden border border-black/10 bg-[#111315] transition-transform duration-300 ease-out group-hover:scale-[1.02] group-focus-visible:scale-[1.02] sm:block sm:h-14 sm:w-20">
              {artwork ? (
                <EventArtworkPreview
                  src={artwork.src}
                  alt={`${event.title} event artwork`}
                  title={event.title}
                  societyName={societyName}
                  societySlug={societySlug}
                  className="h-full w-full"
                />
              ) : (
                <EventBannerFallback title={event.title} societyName={societyName} societySlug={societySlug} showTitle={false} />
              )}
            </div>
          </div>

          <div className="hidden min-w-0 space-y-1.5 text-xs leading-tight text-black/65 sm:block">
            <div className="font-semibold text-[#111315]">{time}</div>
            <div className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-black/58" />
              <span className="break-words">{event.venue || "Venue TBA"}</span>
            </div>
          </div>

          <div className="flex min-w-0 flex-col items-end justify-center gap-2">
            <span className={`max-w-[84px] text-right text-xs font-semibold uppercase leading-tight tracking-[0.06em] sm:max-w-none ${availabilityClass[availability.kind]}`}>
              {statusLabel}
            </span>
            <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center border border-black/14 transition-colors duration-200 group-hover:border-[#00629B] group-hover:bg-[#00629B] group-hover:text-white group-focus-visible:border-[#00629B] group-focus-visible:bg-[#00629B] group-focus-visible:text-white">
              <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

export { EventRow as AnnotatedEventCard };
