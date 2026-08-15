import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import { Link } from "react-router";
import type { ExtendedEvent } from "@/types";
import { formatDate } from "@/lib/dates";
import { resolveEventArtwork } from "@/lib/event-artwork";
import { EventBannerFallback } from "./EventBannerFallback";

interface EventCardProps {
  event: ExtendedEvent;
  index: number;
  onSelect: (event: ExtendedEvent) => void;
  isMobile?: boolean;
  showAnnotations?: boolean;
  animateEntrance?: boolean;
}

function eventStatus(event: ExtendedEvent) {
  const capacity = Number(event.maxCapacity || 0);
  const registered = Number(event.registeredCount || 0);
  if (capacity > 0 && registered >= capacity) return "Sold out";
  if (event.registrationOpen) return "Registration open";
  return "View event";
}

export function AnnotatedEventCard({ event, index, onSelect, animateEntrance = true }: EventCardProps) {
  const reduceMotion = useReducedMotion();
  const artwork = resolveEventArtwork(event);
  const status = eventStatus(event);
  const accent = status === "Registration open" ? "bg-[#00629B]" : "bg-[#111315]";

  return (
    <motion.article
      initial={reduceMotion || !animateEntrance ? false : { opacity: 0, y: 28 }}
      whileInView={reduceMotion || !animateEntrance ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay: Math.min(index, 3) * 0.08, ease: [0.16, 1, 0.3, 1] }}
      className="group min-w-0"
    >
      <Link
        to={`/events/${event.slug}`}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          onSelect(event);
        }}
        className="block"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-[#e9e7e1]">
          {artwork ? (
            <img
              src={artwork.src}
              alt={event.title}
              loading="lazy"
              className={`h-full w-full transition duration-700 ease-out group-hover:scale-[1.025] ${artwork.fit === "contain" ? "object-contain p-8" : "object-cover"}`}
            />
          ) : (
            <EventBannerFallback
              title={event.title}
              societyName={typeof event.society === "object" ? event.society.name : undefined}
              societySlug={typeof event.society === "object" ? event.society.slug : undefined}
              showTitle={false}
            />
          )}
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4 sm:p-5">
            <span className={`${accent} rounded-full px-3 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white shadow-sm sm:text-[10px]`}>
              {status}
            </span>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white/90 text-[#111315] shadow-sm backdrop-blur-md transition duration-300 group-hover:bg-[#00629B] group-hover:text-white">
              <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>

        <div className="border-b border-black/10 py-5 sm:py-6">
          <div className="mb-4 flex items-center justify-between gap-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-black/45">
            <span className="truncate">{typeof event.society === "object" ? event.society.name : "IEEE Sahrdaya"}</span>
            <span>{event.price > 0 ? `₹${event.price}` : "Free"}</span>
          </div>
          <h3 className="max-w-[92%] text-2xl font-semibold leading-[1.08] tracking-[-0.035em] text-[#111315] transition-colors duration-300 group-hover:text-[#00629B] sm:text-3xl">
            {event.title}
          </h3>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-black/55">
            <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4" />{formatDate(event.date)}</span>
            {event.venue && <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4" />{event.venue}</span>}
          </div>
        </div>
      </Link>
    </motion.article>
  );
}
