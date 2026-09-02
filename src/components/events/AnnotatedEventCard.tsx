import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, MapPin } from "lucide-react";
import { Link } from "react-router";
import type { ExtendedEvent } from "@/types";
import { MOTION_DURATION, MOTION_EASE } from "@/lib/motion";
import { getEventAvailability, type EventAvailabilityKind } from "@/lib/event-availability";
import { formatDay, formatMonth, formatWeekdayLong, formatYear } from "@/lib/dates";

interface EventCardProps {
  event: ExtendedEvent;
  index: number;
  active?: boolean;
  onActivate?: (event: ExtendedEvent) => void;
  animateEntrance?: boolean;
}

const availabilityClass: Record<EventAvailabilityKind, string> = {
  "opening-soon": "text-[#00629B]",
  open: "text-[#00629B]",
  filling: "text-teal-700",
  "filling-fast": "text-amber-700",
  "few-left": "text-orange-700",
  "closing-soon": "text-amber-700",
  full: "text-rose-700",
  closed: "text-black/42",
};

export function AnnotatedEventCard({
  event,
  index,
  active = false,
  onActivate,
  animateEntrance = true,
}: EventCardProps) {
  const reduceMotion = useReducedMotion();
  const societyName = typeof event.society === "object" ? event.society.name : "IEEE Sahrdaya";
  const availability = getEventAvailability(event);
  return (
    <motion.article
      initial={reduceMotion || !animateEntrance ? false : { opacity: 0, y: 16 }}
      whileInView={reduceMotion || !animateEntrance ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: MOTION_DURATION.reveal, delay: Math.min(index, 5) * 0.04, ease: MOTION_EASE }}
      className="border-t border-black/12"
    >
      <Link
        to={`/events/${event.slug}`}
        onMouseEnter={() => onActivate?.(event)}
        onFocus={() => onActivate?.(event)}
        className={`group block transition-colors duration-300 ${active ? "text-[#111315] sm:bg-[#111315] sm:text-white" : "text-[#111315] hover:bg-black/[0.035]"}`}
      >
        <motion.div
          className="grid gap-5 px-4 py-6 sm:grid-cols-[78px_minmax(0,1fr)_170px_auto] sm:items-center sm:px-5 sm:py-7 lg:grid-cols-[92px_minmax(0,1fr)_220px_auto] lg:px-6 lg:py-8"
          animate={reduceMotion ? undefined : { x: active ? 3 : 0 }}
          transition={{ duration: MOTION_DURATION.ui, ease: MOTION_EASE }}
        >
          <div className="flex items-baseline gap-2 sm:block">
            <div className={`text-[10px] font-bold uppercase tracking-[0.18em] ${active ? "text-black/38 sm:text-white/42" : "text-black/38"}`}>
              {formatMonth(event.date)}
            </div>
            <motion.div
              className="mt-1 text-3xl font-semibold leading-none tracking-[-0.06em] tabular-nums sm:text-4xl"
              animate={reduceMotion ? undefined : { y: active ? -2 : 0 }}
              transition={{ duration: MOTION_DURATION.micro, ease: MOTION_EASE }}
            >
              {formatDay(event.date)}
            </motion.div>
          </div>

          <div className="min-w-0">
            <div className={`mb-2 flex items-center gap-3 text-[9px] font-bold uppercase tracking-[0.17em] ${active ? "text-black/42 sm:text-white/45" : "text-black/42"}`}>
              <span className="truncate">{societyName}</span>
              <span aria-hidden="true">/</span>
              <span className="shrink-0">{event.price > 0 ? `₹${event.price}` : "Free"}</span>
            </div>
            <h3 className="max-w-3xl text-2xl font-semibold leading-[1.02] tracking-[-0.04em] sm:text-3xl lg:text-[2.15rem]">
              {event.title}
            </h3>
          </div>

          <div className={`space-y-2 text-xs ${active ? "text-black/48 sm:text-white/48" : "text-black/48"}`}>
            <div>{formatWeekdayLong(event.date)} · {formatYear(event.date)}</div>
            {event.venue && (
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{event.venue}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <span className={`text-[9px] font-bold uppercase tracking-[0.16em] ${active ? "text-black/42 sm:text-white/70" : availabilityClass[availability.kind]}`}>
              {availability.label}
            </span>
            <motion.span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border transition-colors ${active ? "border-black/14 sm:border-white/20 sm:bg-white sm:text-[#111315]" : "border-black/14 group-hover:border-[#00629B] group-hover:bg-[#00629B] group-hover:text-white"}`}
              animate={reduceMotion ? undefined : { rotate: active ? 4 : 0 }}
              whileHover={reduceMotion ? undefined : { scale: 1.04 }}
              whileTap={reduceMotion ? undefined : { scale: 0.96 }}
              transition={{ duration: MOTION_DURATION.micro, ease: MOTION_EASE }}
            >
              <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </motion.span>
          </div>
        </motion.div>
      </Link>
    </motion.article>
  );
}
