import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, MapPin } from "lucide-react";
import { Link } from "react-router";
import type { ExtendedEvent } from "@/types";

interface EventCardProps {
  event: ExtendedEvent;
  index: number;
  active?: boolean;
  onActivate?: (event: ExtendedEvent) => void;
  animateEntrance?: boolean;
}

function eventStatus(event: ExtendedEvent) {
  const capacity = Number(event.maxCapacity || 0);
  const registered = Number(event.registeredCount || 0);
  if (capacity > 0 && registered >= capacity) return "Sold out";
  if (event.registrationOpen) return "Registration open";
  return "View event";
}

export function AnnotatedEventCard({
  event,
  index,
  active = false,
  onActivate,
  animateEntrance = true,
}: EventCardProps) {
  const reduceMotion = useReducedMotion();
  const date = new Date(event.date);
  const societyName = typeof event.society === "object" ? event.society.name : "IEEE Sahrdaya";
  const status = eventStatus(event);
  return (
    <motion.article
      initial={reduceMotion || !animateEntrance ? false : { opacity: 0, y: 16 }}
      whileInView={reduceMotion || !animateEntrance ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay: Math.min(index, 5) * 0.04, ease: [0.16, 1, 0.3, 1] }}
      className="border-t border-black/12"
    >
      <Link
        to={`/events/${event.slug}`}
        onMouseEnter={() => onActivate?.(event)}
        onFocus={() => onActivate?.(event)}
        className={`group block transition-colors duration-300 ${active ? "text-[#111315] sm:bg-[#111315] sm:text-white" : "text-[#111315] hover:bg-black/[0.035]"}`}
      >
        <div className="grid gap-5 px-4 py-6 sm:grid-cols-[78px_minmax(0,1fr)_170px_auto] sm:items-center sm:px-5 sm:py-7 lg:grid-cols-[92px_minmax(0,1fr)_220px_auto] lg:px-6 lg:py-8">
          <div className="flex items-baseline gap-2 sm:block">
            <div className={`text-[10px] font-bold uppercase tracking-[0.18em] ${active ? "text-black/38 sm:text-white/42" : "text-black/38"}`}>
              {date.toLocaleDateString("en-IN", { month: "short" })}
            </div>
            <div className="mt-1 text-3xl font-semibold leading-none tracking-[-0.06em] tabular-nums sm:text-4xl">
              {String(date.getDate()).padStart(2, "0")}
            </div>
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
            <div>{date.toLocaleDateString("en-IN", { weekday: "long", year: "numeric" })}</div>
            {event.venue && (
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{event.venue}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <span className={`text-[9px] font-bold uppercase tracking-[0.16em] ${active ? "text-[#00629B] sm:text-[#7dd3fc]" : status === "Registration open" ? "text-[#00629B]" : "text-black/42"}`}>
              {status}
            </span>
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border transition duration-300 ${active ? "border-black/14 sm:border-white/20 sm:bg-white sm:text-[#111315]" : "border-black/14 group-hover:border-[#00629B] group-hover:bg-[#00629B] group-hover:text-white"}`}>
              <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </Link>
    </motion.article>
  );
}
